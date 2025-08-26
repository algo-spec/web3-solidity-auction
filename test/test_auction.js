const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers, upgrades, deployments } = require("hardhat");

describe("NFT Auction TEST", async () => {

    let deployer, admin, seller, buyer1, buyer2;
    let nftAuctionFactory, auction;
    let mockERC721, mockERC20;
    let tokenId = 1;
    let ethToUSD, usdcToUSD;

    // 测试环境初始化
    before(async () => {
        // 获取用户
        [deployer, admin, seller, buyer1, buyer2] = await ethers.getSigners();
        console.log(`📝 账户信息: 
            Deployer: ${deployer.address}
            Admin:    ${admin.address}
            Seller:   ${seller.address}
            Buyer1:   ${buyer1.address}
            Buyer2:   ${buyer2.address}`);

        console.log("🚀 开始部署测试合约");

        // 部署ERC20 代币合约
        const MockERC20 = await ethers.getContractFactory('MockERC20');
        mockERC20 = await MockERC20.deploy();
        await mockERC20.waitForDeployment();

        // 部署ERC721 NFT 合约
        const MockERC721 = await ethers.getContractFactory('MockERC721');
        mockERC721 = await MockERC721.deploy();
        await mockERC721.waitForDeployment();

        // 部署价格预言机,本地测试：通过构造函数初始化价格【sepolia网测试，通过chainLink获取价格】
        const AggregatorV3 = await ethers.getContractFactory('AggregatorV3');
        ethToUSD = await AggregatorV3.deploy(ethers.parseEther('10000'));
        await ethToUSD.waitForDeployment();

        usdcToUSD = await AggregatorV3.deploy(ethers.parseEther('1'));
        await usdcToUSD.waitForDeployment();

        // 部署拍卖工厂
        await deployments.fixture(["deployNftAuctionFactory"]);
        const NftAuctionFactory = await deployments.get("NftAuctionFactory");
        nftAuctionFactory = await ethers.getContractAt("NftAuctionFactory", NftAuctionFactory.address);
        console.log("✅ 所有合约部署完毕!");

    });

    beforeEach(async () => {
        console.log("🎨 准备测试数据，TokenId", tokenId);

        // 铸造NFT给卖家seller
        const tx = await mockERC721.mint(seller, tokenId);
        await tx.wait();
        console.log("✅ NFT #", tokenId, "铸造成功：", seller.address);

        // 验证NFT所有权
        const owner = await mockERC721.ownerOf(tokenId);
        console.log("✅ NFT #", tokenId, "的当前拥有者：", owner);

        // seller 授权NFT给工厂
        const factoryAddress = await nftAuctionFactory.getAddress();
        await mockERC721.connect(seller).approve(factoryAddress, tokenId);
        console.log("✅ NFT #", tokenId, "授权给工厂成功");

        // 给buyer 分发 ERC20代币
        const tx1 = await mockERC20.transfer(buyer1.address, ethers.parseEther("100"));
        await tx1.wait();
        console.log("✅ 给buyer1 分发 100 个代币成功");
        const tx2 = await mockERC20.transfer(buyer2.address, ethers.parseEther("200"));
        await tx2.wait();
        console.log("✅ 给buyer2 分发 200 个代币成功");

        // 下次测试时，TokenId自增1
        tokenId++;
    });

    describe("测试创建拍卖", async () => {
        it("验证工厂合约已部署", async () => {
            const factoryAddress = await nftAuctionFactory.getAddress();
            console.log("✅ 工厂地址:", factoryAddress);

            const factoryAdmin = await nftAuctionFactory.admin();
            console.log("✅ 工厂管理员:", factoryAdmin);
            expect(factoryAdmin).to.equal(deployer);
        });

        it("通过工厂创建拍卖", async () => {
            console.log("🎨 开始创建拍卖，tokenId", tokenId - 1);

            // seller 授权给工厂合约
            const factoryAddress = await nftAuctionFactory.getAddress();
            console.log("✅ 工厂地址:", factoryAddress);

            // 通过工厂创建拍卖合约
            await nftAuctionFactory.connect(seller).createAuction(await mockERC721.getAddress(), tokenId - 1, ethers.parseEther("0.01"), 60);
            console.log("✅ 创建拍卖合约成功");

            const auctions = await nftAuctionFactory.getAuctions();
            console.log("✅ 共有：", auctions.length, "场拍卖");

            const nftAddress = auctions[auctions.length - 1];
            //创建NFT拍卖合约
            auction = await ethers.getContractAt("NftAuction", nftAddress);
            console.log("✅ 当前拍卖合约地址:", nftAddress);
        });
    });

    describe("测试拍卖竞价", async () => {
        it("进行竞价", async () => {
            console.log("🎨 进行竞价，tokenId", tokenId - 1);
            await nftAuctionFactory.connect(seller).createAuction(await mockERC721.getAddress(), tokenId - 1, ethers.parseEther("0.01"), 60);
            console.log("✅ 创建拍卖合约成功");

            const auctions = await nftAuctionFactory.getAuctions();
            auction = await ethers.getContractAt("NftAuction", auctions[auctions.length - 1]);

            const tokenToUsd = [{ tokenAddr: ethers.ZeroAddress, priceFeed: ethToUSD }, { tokenAddr: mockERC20, priceFeed: ethToUSD }]
            for (let i = 0; i < tokenToUsd.length; i++) {
                const { tokenAddr, priceFeed } = tokenToUsd[i];
                await auction.setPriceFeed(tokenAddr, priceFeed);
            }
            // 卖家1使用ETH出价
            await auction.connect(buyer1).bid(ethers.ZeroAddress, 0, { value: ethers.parseEther("0.012") });
            // 卖家2使用ERC20代币出价
            await mockERC20.connect(buyer2).approve(auction.getAddress(), ethers.MaxUint256);
            await auction.connect(buyer2).bid(ethers.ZeroAddress, 0, { value: ethers.parseEther("122") });

            const status = await auction.getAuctionInfo();
            console.log("✅ 进行竞价成功，最高出价者：", status[4], "出价：", status[3]);

        });
    });

    describe("测试拍卖结束", async () => {
        beforeEach(async () => {
            console.log("🎨 测试拍卖结束，tokenId", tokenId - 1);
            // 创建拍卖
            await nftAuctionFactory.connect(seller).createAuction(await mockERC721.getAddress(), tokenId - 1, ethers.parseEther("0.01"), 60);

            const auctions = await nftAuctionFactory.getAuctions();
            auction = await ethers.getContractAt("NftAuction", auctions[auctions.length - 1]);
        });
        it("有人出价时应该转移NFT给买家", async () => {
            await auction.connect(buyer2).bid(ethers.ZeroAddress, 0, { value: ethers.parseEther("122") });

            await time.increase(61);
            await auction.connect(seller).endAuction();
            console.log("✅ 有人出价拍卖结束");
        });
        it("无人出价时返回NFT给卖家", async () => {
            await time.increase(61);
            await auction.connect(seller).endAuction();
            console.log("✅ 无人出价拍卖结束");
        });
    });

    describe("测试NFT合约升级", async () => {
        it("测试NftAuctionV2新增接口", async () => {
            console.log("🎨 测试NftAuctionV2新增接口，tokenId", tokenId - 1);
            // 创建拍卖
            await nftAuctionFactory.connect(seller).createAuction(await mockERC721.getAddress(), tokenId - 1, ethers.parseEther("0.01"), 60);

            const auctions = await nftAuctionFactory.getAuctions();
            const auctionAddress = auctions[auctions.length - 1]; // 获取最新创建的拍卖合约
            await ethers.getContractAt("NftAuction", auctionAddress);

            // 升级合约到V2版本
            const NftAuctionV2 = await ethers.getContractFactory("NftAuctionV2");
            const upgradedAuction = await upgrades.upgradeProxy(auctionAddress, NftAuctionV2);
            await upgradedAuction.waitForDeployment();

            // 验证新增的hello函数
            const greeting = await upgradedAuction.hello();
            expect(greeting).to.equal("hello world");

            console.log("✅ 合约成功升级到V2版本");
            console.log("✅ 新增的hello()函数返回值:", greeting);
        });

    });

});