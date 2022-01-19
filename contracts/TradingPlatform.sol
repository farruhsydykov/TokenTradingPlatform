// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./FrrankToken.sol";
import "./ITradingPlatform.sol";
import "../node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../node_modules/@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "../node_modules/@openzeppelin/contracts/access/AccessControl.sol";

contract TradingPlatform is ITradingPlatform, AccessControl, ReentrancyGuard {

    using SafeERC20 for IERC20;

    enum ContractState {PAUSED, SALE, TRADE}
    enum OrderStatus {DOES_NOT_EXIST, AVAILABLE, FILLED}

    ContractState public contractState;
    uint8 decimalsOftargetToken;
    uint16 public roundNumber;
    uint32 roundDuration = 3 days;
    uint256 public saleRoundTokenPrice;
    uint256 public availableTokensThisRound;
    uint256 public boughtTokensThisRound;
    uint256 burnedTokensThisRound;
    uint256 public roundEndsAt;
    uint256 public ethAmountTradedDuringTradeRound = 1 ether;
    uint256 public ethAccumulatedDuringSaleRound;
    address public targetTokenAddress;

    uint256 public lastOrderId;
    mapping(uint256 => Order) public orderIdToOrder;
    mapping(address => bool) public isReferral;
    mapping(address => address) public referrals;

    struct Referrals {
        address firstReferral;
        address secondReferral;
    }

    struct Order {
        OrderStatus orderStatus;
        uint256 tokensAmount;
        uint256 tokensBought;
        uint256 tokenPriceInWei;
        address orderCreator;
    }

    constructor(string memory _tokenName, string memory _tokenSymbol) {
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

        FrrankToken frrankToken = new FrrankToken(_tokenName, _tokenSymbol, _msgSender(), address(this));
        targetTokenAddress = address(frrankToken);
        contractState = ContractState.SALE;
        roundEndsAt = block.timestamp + roundDuration;
        decimalsOftargetToken = 18;
        saleRoundTokenPrice = 10000000000000;
        availableTokensThisRound = ethAmountTradedDuringTradeRound * 10**18 / saleRoundTokenPrice;

        FrrankToken(targetTokenAddress).mint(address(this), availableTokensThisRound);

        emit TradeRoundFinish(roundNumber, ethAmountTradedDuringTradeRound, block.timestamp);
        emit SaleRoundStart(
            ++roundNumber,
            availableTokensThisRound,
            saleRoundTokenPrice,
            block.timestamp
        );
    }

    modifier duringGivenRoundOnly(ContractState currentRoundState) {
        require(contractState == currentRoundState, "This function can not be called during this round");
        _;
    }

    modifier TimeForThisRoundHasPassed {
        require(roundEndsAt > block.timestamp, "Time for this round has past but the round was not changed");
        _;
    }

    /**
        @dev Starts sale round and mints to address(this) an amount of
        tokens for sale equal to amount of ETH traded in previous trade
        round divided by this sale's round token pride.
        @notice Will not set state as sale round if there are no more
        prices for tokens provided.
     */
    function startSaleRound()
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
        duringGivenRoundOnly(ContractState.TRADE)
    {
        require(roundEndsAt < block.timestamp, "Previous round is not ended yet");


        availableTokensThisRound = ethAmountTradedDuringTradeRound * 10**18 / saleRoundTokenPrice;
        ethAccumulatedDuringSaleRound = 0;
        boughtTokensThisRound = 0;
        burnedTokensThisRound = 0;
        roundEndsAt = block.timestamp + roundDuration;
        contractState = ContractState.SALE;
        saleRoundTokenPrice = getNextRoundTokenPrice(saleRoundTokenPrice);

        FrrankToken(targetTokenAddress).mint(address(this), availableTokensThisRound);

        emit TradeRoundFinish(roundNumber - 1, ethAmountTradedDuringTradeRound, block.timestamp);
        emit SaleRoundStart(roundNumber, availableTokensThisRound, saleRoundTokenPrice, block.timestamp);
    }

    /**
        @dev Starts trade round and burns all unsold in previous sale round tokens.
        @notice Can be called earlier if all tokens in sale round were sold.
     */
    function startTradeRound()
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
        duringGivenRoundOnly(ContractState.SALE)
    {
        bool canBeChanged = availableTokensThisRound == boughtTokensThisRound || roundEndsAt < block.timestamp;
        require(canBeChanged, "Previous round is not ended yet");
        
        if(availableTokensThisRound != boughtTokensThisRound) {
            burnedTokensThisRound = availableTokensThisRound - boughtTokensThisRound;
        }
        ethAmountTradedDuringTradeRound = 0;
        roundEndsAt = block.timestamp + roundDuration;
        contractState = ContractState.TRADE;

        FrrankToken(targetTokenAddress).burn(address(this), burnedTokensThisRound);

        emit SaleRoundFinish(
            roundNumber,
            boughtTokensThisRound,
            burnedTokensThisRound,
            ethAccumulatedDuringSaleRound,
            block.timestamp
        );
        emit TradeRoundStart(roundNumber, block.timestamp);
    }

    /**
        @dev lets user buy tokens from contract, distributes fee to referrals.
        @param _tokensToBuy amount of tokens sender wants to buy from contract.
        Presumably multiplied by targetToken.decimals()
     */
    function buyTokensFromContract(uint256 _tokensToBuy)
        payable
        external
        override
        nonReentrant
        TimeForThisRoundHasPassed
        duringGivenRoundOnly(ContractState.SALE)
    {
        uint256 tokensLeft = availableTokensThisRound - boughtTokensThisRound;
        uint256 priceOfOrderedTokens = saleRoundTokenPrice * _tokensToBuy / 10**decimalsOftargetToken;

        require(roundEndsAt > block.timestamp, "Sale round is finished");
        require(tokensLeft > 0, "No tokens left to buy in this sale round");
        require(_tokensToBuy <= tokensLeft, "There is not enough tokens to fill your order");
        require(priceOfOrderedTokens <= msg.value, "You are sending not enough ETH to fill your order");
        
        boughtTokensThisRound += _tokensToBuy;
        ethAccumulatedDuringSaleRound += msg.value;

        distributeReferralFees(50, 30);

        IERC20(targetTokenAddress).safeTransfer(_msgSender(), _tokensToBuy);

        emit TokensBoughtFromSale(roundNumber, _msgSender(), _tokensToBuy);
    }

    /**
        @dev Creates a sell order for trade round.
        @param _tokensAmount Amount of tokens to sell in trade order.
        @param _tokenPriceInWei Price in wei per token.
        @notice _tokensAmount and _tokenPriceInWei are passes as n * 10**18.
     */
    function createSellOrder(uint256 _tokensAmount, uint256 _tokenPriceInWei)
        external
        override
        nonReentrant
        TimeForThisRoundHasPassed
        duringGivenRoundOnly(ContractState.TRADE)
    {
        require(_tokensAmount > 0, "You can't create an order for 0 tokens");
        require(_tokenPriceInWei > 0, "You can't set price per token as 0");

        IERC20(targetTokenAddress).safeTransferFrom(_msgSender(), address(this), _tokensAmount);

        Order storage theOrder = orderIdToOrder[lastOrderId++];
        theOrder.orderStatus = OrderStatus.AVAILABLE;
        theOrder.tokensAmount = _tokensAmount;
        theOrder.tokenPriceInWei = _tokenPriceInWei;
        theOrder.orderCreator = _msgSender();

        emit NewSellOrder(lastOrderId - 1, _tokensAmount, _tokenPriceInWei);
    }

    /**
        @dev Lets msg.sender buy tokens from another user's sell order.
        @param _orderId Id of sell order to buy from.
        @param _tokensAmount Amount of tokens to buy from sell order.
        @notice If a given order available tokens are less than _tokensAmount function reverts.
        _tokensAmount and _tokenPriceInWei are passes as n * 10**18.
     */
    function buyTokensFromOrder(uint256 _orderId, uint256 _tokensAmount)
        payable
        external
        override
        nonReentrant
        TimeForThisRoundHasPassed
        duringGivenRoundOnly(ContractState.TRADE) 
    {
        Order storage theOrder = orderIdToOrder[_orderId];
        uint256 tokensLeftInOrder = theOrder.tokensAmount - theOrder.tokensBought;
        bool orderSatisfiesDemand = theOrder.orderStatus == OrderStatus.AVAILABLE && tokensLeftInOrder >= _tokensAmount;
        require(orderSatisfiesDemand, "Order does not exist, already filled or there is not enough tokens");
        require(msg.value >= theOrder.tokenPriceInWei * _tokensAmount / 10**decimalsOftargetToken, "You are paying not enough ETH");

        if (tokensLeftInOrder - _tokensAmount == 0) {
            theOrder.orderStatus = OrderStatus.FILLED;
        }
        theOrder.tokensBought += _tokensAmount;

        distributeReferralFees(25, 25);
        uint256 _amount = msg.value / 1000 * 950;

        (bool sent, bytes memory data) = payable(theOrder.orderCreator).call{value: _amount}("");
        require(sent, string(data));

        IERC20(targetTokenAddress).safeTransfer(_msgSender(), _tokensAmount);

        emit TokensBoughtFromOrder(_orderId, theOrder.orderCreator, _tokensAmount, theOrder.tokenPriceInWei);
    }

    /**
        @dev Sets a referral to one of two available slots for msg.sender.
        @param _referral Is the referral to be set.
        @notice Referrer can't set itself or address(0) as referral.
        Address must be registered as referral to act as one for someone.
        There must be a slot available to set a referral. Referrals can't be reset.
     */
    function registerAReferral(address _referral) external override {
        require(referrals[_msgSender()] == address(0), "You've already set a referral");
        require(_msgSender() != referrals[_referral], "You can't set someone who has you as referral as your referral");
        require(
            _referral != address(0) && _referral != _msgSender() && isReferral[_referral],
            "Referral can't be an address zero, yourself and must be registered as a referral to be one"
        );

        referrals[_msgSender()] = _referral;

        emit ReferralSet(_msgSender(), _referral);
    }

    /**
        @dev Registers msg.sender as a referral to be able to act as one.
     */
    function becomeAReferral() external override {
        require(!isReferral[_msgSender()], "You are already registered as referral");

        isReferral[_msgSender()] = true;
    }

    /**
        @dev internal function to distribute fees to referrals
        @param _firstFeeAmount fee amount for the first referral
        @param _secondFeeAmount fee amount for second referral
     */
    function distributeReferralFees(uint256 _firstFeeAmount, uint256 _secondFeeAmount) internal {
        address payable firstReferral = payable(referrals[_msgSender()]);
        address payable secondReferral = payable(firstReferral);

        uint256 firstAmount = msg.value / 1000 * _firstFeeAmount;
        uint256 secondAmount = msg.value / 1000 * _secondFeeAmount;
        
        if(firstReferral != address(0)) {
            (bool success1, bytes memory data1) = firstReferral.call{value: firstAmount}("");
            if (!success1) revert(string(data1));
            emit FeeTransferredToReferral(firstReferral, firstAmount);
            if(secondReferral != address(0)) {
                (bool success2, bytes memory data2) = secondReferral.call{value: secondAmount}("");
                if (!success2) revert(string(data2));
                emit FeeTransferredToReferral(secondReferral, secondAmount);
            }
        }
    }

    function getNextRoundTokenPrice(uint256 _previousRoundTokenPrice) internal pure returns (uint256) {
        return (_previousRoundTokenPrice * 103) / 100 + 0.000004 ether;
    }

    function getReferralOf(address adr) external view returns(address) {
        return referrals[adr];
    }
}