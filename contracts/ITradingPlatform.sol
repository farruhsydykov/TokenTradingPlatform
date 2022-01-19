// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ITradingPlatform {
    event SaleRoundStart(uint256 indexed roundNumber, uint256 tokensAvailable, uint256 tokenPriceInEth, uint256 startTime);
    event SaleRoundFinish(uint256 indexed roundNumber, uint256 tokensSold, uint256 tokensBurned, uint256 ethCollected, uint256 finishTime);
    event TradeRoundStart(uint256 indexed roundNumber, uint256 startTime);
    event TradeRoundFinish(uint256 indexed roundNumber, uint256 amountTraded, uint256 finishTime);
    event NewSellOrder(uint256 indexed orderId, uint256 tokensAmount, uint256 ethPricePerToken);
    event TokensBoughtFromSale(uint256 indexed roundNumber, address indexed buyer, uint256 tokensAmount);
    event TokensBoughtFromOrder(uint256 indexed orderId, address orderOwner, uint256 amountOfTokensBought, uint256 weiPricePerToken);
    event FeeTransferredToReferral(address indexed referral, uint256 feeAmount);
    event ReferralSet(address indexed referrer, address referral);

    function startSaleRound() external;

    function startTradeRound() external;

    function buyTokensFromContract(uint256 _tokensToBuy) payable external;

    function createSellOrder(uint256 _tokensAmount, uint256 _tokenPriceInWei) external;

    function buyTokensFromOrder(uint256 _orderId, uint256 _tokensAmount) payable external;

    function registerAReferral(address _referral) external;

    function becomeAReferral() external;
}