// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "./NftAuction.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract NftAuctionFactory is Initializable, UUPSUpgradeable {
    NftAuction[] public auctions; // 所有创建的拍卖合约

    address public admin; // 管理员

    uint256 public nextTokenId; // 下一个NFT的token id

    address public auctionImplementation; // 拍卖合约的实现

    /**
     * @dev 构造函数
     * @param _auctionImplementation 拍卖合约的实现地址
     */
    function initialize(address _auctionImplementation) public initializer {
        __UUPSUpgradeable_init();
        admin = msg.sender;
        nextTokenId = 1;
        auctionImplementation = _auctionImplementation;
    }

    /**
     * @dev 创建拍卖合约
     * @param nftAddress NFT合约地址
     * @param tokenId NFT的token id
     * @param startPrice 拍卖起始价格
     * @param duration 拍卖持续时间
     */
    function createAuction(
        address nftAddress,
        uint256 tokenId,
        uint256 startPrice,
        uint256 duration
    ) external returns (address) {
        // require(msg.sender == admin, "Only admin can create auction");
        require(startPrice > 0, "Start price should be greater than 0");
        require(duration > 0, "Duration should be greater than 0");

        // 通过ERC1967Proxy创建拍卖合约
        bytes memory initData = abi.encodeWithSelector(
            NftAuction.initialize.selector,
            admin
        );

        ERC1967Proxy proxy = new ERC1967Proxy(auctionImplementation, initData);
        NftAuction auction = NftAuction(address(proxy));

        // 设置拍卖合约的参数
        auction.setAuctionParams(nftAddress, tokenId, startPrice, duration);

        // 转移NFT到拍卖合约
        IERC721(nftAddress).transferFrom(msg.sender, address(auction), tokenId);

        // 记录拍卖合约
        auctions.push(auction);
        nextTokenId++;

        return address(auction);
    }

    /**
     * @dev 获取指定的tokenId的创建的拍卖合约
     */
    function getAuction(uint256 tokenId) external view returns (NftAuction) {
        return auctions[tokenId];
    }

    /**
     * @dev 获取所有创建的拍卖合约
     */
    function getAuctions() external view returns (NftAuction[] memory) {
        return auctions;
    }

    /**
     * @dev 更新拍卖合约实现地址
     * @param _newAuctionImplementation 新的拍卖合约实现地址
     */
    function updateAuctionImplementation(
        address _newAuctionImplementation
    ) external onlyOwner {
        auctionImplementation = _newAuctionImplementation;
    }

    /**
     * @dev 升级工厂合约本身
     * @param newImplementation 新的工厂合约实现地址
     */
    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

    /**
     * @dev ERC721 接收函数，允许工厂合约接受NFT
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /**
     * @dev 管理员修饰器
     */
    modifier onlyOwner() {
        require(msg.sender == admin, "Only admin");
        _;
    }
}
