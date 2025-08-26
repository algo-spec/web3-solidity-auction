const { upgrades, ethers } = require("hardhat");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();
    console.log("NFT-Upgrade: 部署用户地址", deployer);

    // 获取NftAuctionFactory的合约工厂  
    const nftFactory = await deployments.get("NftAuctionFactory");
    const nftFactoryAddress = nftFactory.getAddress();
    const factory = await ethers.getContractAt("NftAuctionFactory", nftFactoryAddress);
    console.log("NFT-Upgrade: 获取NftAuctionFactory合约地址", nftFactoryAddress);

    // 升级工厂合约本身
    const NftAuctionFactoryV2 = await ethers.getContractFactory("NftAuctionFactory");
    // 使用upgrades.upgradeProxy来升级UUPS代理合约
    const nftAuctionFactoryV2 = await upgrades.upgradeProxy(factoryAddress, NftAuctionFactoryV2);
    await nftAuctionFactoryV2.waitForDeployment();

    const upgradedFactoryV2Address = await nftAuctionFactoryV2.getAddress();
    console.log("NFT-Upgrade: 升级后的工厂合约地址", upgradedFactoryV2Address);

    // 获取新的实现地址
    const factoryImplV2 = await upgrades.erc1967.getImplementationAddress(upgradedFactoryV2Address);
    console.log("NFT-Upgrade: 新的工厂合约实现地址", factoryImplV2);

    const auctions = await factory.getAuctions();
    console.log("NFT-Upgrade: 待升级的拍卖合约地址", auctions);

    if (auctions.length === 0) {
        console.log("NFT-Upgrade: 没有找到拍卖合约");
        return;
    }

    const proxyAuctionAddress = auctions[0];

    //获取NFTAuctionV2的合约工厂
    const NftAuctionV2 = await ethers.getContractFactory("NftAuctionV2");
    // 部署可升级的NFTAuctionV2合约
    const nftAuctionV2Proxy = await upgrades.upgradeProxy(proxyAuctionAddress, NftAuctionV2);
    await nftAuctionV2Proxy.waitForDeployment();
    const nftAuctionV2ProxyAddress = nftAuctionV2Proxy.getAddress();
    console.log("NFT-Upgrade: 升级后的拍卖合约地址", nftAuctionV2ProxyAddress);

    // 获取NFTAuctionV2的实现地址
    const implementationAddress = await upgrades.erc1967.getImplementationAddress(nftAuctionV2ProxyAddress);
    console.log("NFT-Upgrade: 新的v2的实现地址", implementationAddress);

    // await save("NftAuctionV2", {
    //     abi: NftAuctionV2.interface.format("json"),
    //     address: nftAuctionV2ProxyAddress,
    // });

}

module.exports.tags = ["upgradeNftAuction"];