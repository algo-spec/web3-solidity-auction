// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract NftAuctionV2 is Initializable, UUPSUpgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    // 拍卖结构体
    struct Auction {
        address seller; // 拍卖人地址
        uint256 startTime; // 起拍时间
        uint256 duration; // 拍卖持续时间
        uint256 startPrice; // 起拍价格
        uint256 highestBid; // 最高出价
        address highestBidder; // 最高出价人地址
        bool ended; // 是否结束
        address nftContract; // NFT合约地址
        uint256 tokenId; // NFT代币ID
        address tokenAddress; // 竞拍代币地址
    }

    Auction public auction; // 拍卖合约
    address public admin; // 管理员地址
    mapping(address => AggregatorV3Interface) public priceFeeds; // 价格预言机映射表

    /**
     * @dev 初始化函数
     * @param _seller 卖家地址
     */
    function initialize(address _seller) public initializer {
        __UUPSUpgradeable_init();
        admin = msg.sender;
        auction.seller = _seller;
    }

    /**
     * @dev 设置价格预言机
     * @param _nftAddress 代币地址
     * @param _priceFeed  价格预言机地址
     */
    function setPriceFeed(address _nftAddress, address _priceFeed) external {
        priceFeeds[_nftAddress] = AggregatorV3Interface(_priceFeed);
    }

    /**
     * @dev 获取最新价格
     * @param _tokenAddress 代币地址
     * @return 最新价格
     */
    function getLatestPrice(
        address _tokenAddress
    ) public view returns (int256) {
        if (_tokenAddress == address(0)) {
            return 1e8;
        }
        AggregatorV3Interface priceFeed = priceFeeds[_tokenAddress];
        (, int256 answer, , , ) = priceFeed.latestRoundData();
        return answer;
    }

    /**
     * @dev 设置拍卖参数
     * @param _nftContract NFT合约地址
     * @param _tokenId NFT Token ID
     * @param _startPrice 起拍价格
     * @param _duration 拍卖持续时间
     */
    function setAuctionParams(
        address _nftContract,
        uint256 _tokenId,
        uint256 _startPrice,
        uint256 _duration
    ) external onlyAdmin {
        require(_startPrice > 0, "Start price must be greater than 0");
        require(_duration > 0, "Duration must be greater than 0");
        auction.nftContract = _nftContract;
        auction.tokenId = _tokenId;
        auction.startPrice = _startPrice;
        auction.startTime = block.timestamp;
        auction.duration = _duration;
        auction.tokenAddress = address(0);
        auction.ended = false;
        auction.highestBidder = address(0);
        auction.highestBid = 0;
    }

    /**
     * @dev 参与拍卖
     * @param _tokenAddress 竞拍代币地址
     * @param _amount 竞拍数量
     */
    function bid(address _tokenAddress, uint256 _amount) public payable {
        Auction storage _auction = auction;
        require(
            !_auction.ended &&
                block.timestamp < _auction.startTime + _auction.duration,
            "Auction has ended or not started yet"
        );

        // 代币换算成统一单位
        uint payValue;

        if (_tokenAddress == address(0)) {
            _amount = msg.value;
            payValue = _amount * uint(getLatestPrice(_tokenAddress));
        } else {
            payValue = _amount * uint(getLatestPrice(_tokenAddress));
        }

        // 计算起拍价和最高价的统一价值
        uint256 startPrice = _auction.startPrice *
            uint(getLatestPrice(_auction.tokenAddress));
        uint256 highestPrice = _auction.highestBid *
            uint(getLatestPrice(_auction.tokenAddress));

        require(
            payValue > highestPrice && payValue > startPrice,
            "Bid price must be higher than current highest bid"
        );

        // 转移ERC20代币给合约
        if (_tokenAddress != address(0)) {
            IERC20(_tokenAddress).transferFrom(
                msg.sender,
                address(this),
                _amount
            );
        }

        // 退还上一个最高出价者的代币
        if (_auction.highestBidder != address(0)) {
            if (_tokenAddress == address(0)) {
                // ETH出价
                payable(_auction.highestBidder).transfer(_auction.highestBid);
            } else {
                // ERC20出价
                IERC20(_auction.tokenAddress).transfer(
                    _auction.highestBidder,
                    _auction.highestBid
                );
            }
        }

        // 更新最高出价
        _auction.highestBid = _amount;
        _auction.highestBidder = msg.sender;
        _auction.tokenAddress = _tokenAddress;
    }

    /**
     * @dev 结束拍卖
     */
    function endAuction() external {
        Auction storage _auction = auction;
        require(!_auction.ended, "Auction has ended");

        require(
            block.timestamp >= _auction.startTime + _auction.duration,
            "Auction has not ended yet"
        );

        // 转移NFT给拍卖人
        if (_auction.highestBidder != address(0)) {
            // 将NFT转移给最高出价者
            IERC721(_auction.nftContract).transferFrom(
                address(this),
                _auction.highestBidder,
                _auction.tokenId
            );

            // 转移代币给卖家
            if (_auction.tokenAddress != address(0)) {
                IERC20(_auction.tokenAddress).transfer(
                    _auction.seller,
                    _auction.highestBid
                );
            } else {
                payable(_auction.seller).transfer(_auction.highestBid);
            }
        } else {
            // 无人出价，将NFT返回给卖家
            IERC721(_auction.nftContract).transferFrom(
                address(this),
                _auction.seller,
                _auction.tokenId
            );
        }

        _auction.ended = true;
    }

    /**
     *@dev 获取拍卖信息
     */
    function getAuctionInfo()
        external
        view
        returns (
            uint256 startTime,
            uint256 duration,
            uint256 startPrice,
            uint256 highestBid,
            address highestBidder,
            bool ended
        )
    {
        return (
            auction.startTime,
            auction.duration,
            auction.startPrice,
            auction.highestBid,
            auction.highestBidder,
            auction.ended
        );
    }

    /**
     * @dev 管理员修饰器
     */
    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    /**
     * @dev 重写UUPSUpgradeable的_authorizeUpgrade方法
     */
    function _authorizeUpgrade(address) internal virtual override {
        require(msg.sender == admin, "Only admin");
    }

    // ERC721接收函数
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /**
     * @dev 用户测试合约升级
     */
    function hello() external pure returns (string memory) {
        return "hello world";
    }
}
