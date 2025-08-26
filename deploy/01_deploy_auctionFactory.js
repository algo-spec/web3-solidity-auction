const { deployments, upgrades, ethers } = require("hardhat");

const fs = require("fs");
const path = require("path");
const { deploy } = require("@openzeppelin/hardhat-upgrades/dist/utils");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { save } = deployments;
    const { deployer } = await getNamedAccounts();
    console.log("Deploy-Factory: 部署用户地址：", deployer);

    // 通过合约工厂获取NFTAuction合约
    const NftAuction = await ethers.getContractFactory("NftAuction");
    // 部署NFTAuction合约
    const nftAuctionProxy = await upgrades.deployProxy(NftAuction, [deployer], { initializer: 'initialize' });
    await nftAuctionProxy.waitForDeployment();

    const proxyAddress = await nftAuctionProxy.getAddress();
    console.log("Deploy-Factory: NFT代理合约地址：", proxyAddress);
    const nftAuctionImplAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("Deploy-Factory: NFT合约实现地址：", nftAuctionImplAddress);

    // 通过工厂获取NFTAuctionFactory合约
    const NftAuctionFactory = await ethers.getContractFactory("NftAuctionFactory");
    // 部署NFTAuctionFactory合约
    const nftAuctionFactory = await upgrades.deployProxy(NftAuctionFactory, [nftAuctionImplAddress], { initializer: "initialize" });
    await nftAuctionFactory.waitForDeployment();
    const nftFactoryAddress = await nftAuctionFactory.getAddress();
    console.log("Deploy-Factory: NFT工厂合约地址：", nftFactoryAddress);

    const factoryImpl = await upgrades.erc1967.getImplementationAddress(nftFactoryAddress);

    const storePath = path.resolve(__dirname, './.cache/proxyNftAuctionFactory.json');

    fs.writeFileSync(storePath, JSON.stringify({
        address: nftFactoryAddress,
        impl: factoryImpl,
        abi: NftAuctionFactory.interface.format("json")
    }));

    await save("NftAuctionFactory", {
        abi: NftAuctionFactory.interface.format("json"),
        address: nftFactoryAddress,
        args: [nftAuctionImplAddress],
    });
}

module.exports.tags = ["deployNftAuctionFactory"];