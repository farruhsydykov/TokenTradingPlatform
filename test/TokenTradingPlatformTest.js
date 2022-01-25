const fs = require("fs");
const dotenv = require("dotenv");
const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const { BigNumber } = require("ethers");
const { isCommunityResourcable } = require("@ethersproject/providers");
const { loadFixture } = waffle;

async function fixture(wallet, provider) {
    const platform = await ethers.getContractFactory("TradingPlatform");
    const Platform = await platform.deploy("TOKEN_NAME", "TN");
    await Platform.deployed();
    const Token = await ethers.getContractAt("FrrankToken", await Platform.targetTokenAddress());
    return { Platform, Token };
}

function tokensAmount(amount) {
    return ethers.utils.parseUnits(amount.toString(), 18)
}

async function buyTokensFromContract(amountOdTokens, ethAmount, platform, signer) {
    const options = {value: ethAmount};
    if (signer === undefined) {
        await platform.buyTokensFromContract(tokensAmount(amountOdTokens), options)
    } else await platform.connect(signer).buyTokensFromContract(tokensAmount(amountOdTokens), options)
}

describe("Token trading platform:", async () => {
    let owner, adr1, adr2, adr3, platform, token, provider, firstTokenPrice, constructionTimestamp;
    const adr0 = ethers.constants.AddressZero;

    before(async () => {
        provider = waffle.provider;
        [owner, adr1, adr2, adr3] = await ethers.getSigners();
        const Platform = await ethers.getContractFactory("TradingPlatform");
        platform = await Platform.deploy("TOKEN_NAME", "TN");
        token = await ethers.getContractAt("FrrankToken", await platform.targetTokenAddress());
        firstTokenPrice = await platform.saleRoundTokenPrice();
        constructionTimestamp = await (await provider.getBlock(1)).timestamp;
    })

    // beforeEach(async () => {
    //     const {Platform} = await loadFixture(fixture);
    //     platform = Platform;
    // })
    
    describe("Post init state check:", async () => {
        it("contractState is set as Sale round", async () => {
            expect(await platform.contractState()).to.be.equal(1)
        })

        it("roundNumber is set as 1", async () => {
            expect(await platform.roundNumber()).to.be.equal(1)
        })

        it("saleRoundTokenPrice is set as 10000000000000 wei ", async () => {
            expect(await platform.saleRoundTokenPrice()).to.be.equal(ethers.utils.parseUnits("0.00001", 18))
        })

        it("availableTokensThisRound is set as 100000 tokens", async () => {
            expect(await platform.availableTokensThisRound()).to.be.equal(ethers.utils.parseUnits("100000", 18))
        })

        it("targetTokenAddress is set as address of token that was deployed while platform deployment", async () => {
            expect(await platform.targetTokenAddress()).to.be.equal(token.address)
        })

        it(
            "emits SaleRoundStart with roundNumber = 1, tokensAvailable = 100000000000000000000000" + 
            "tokenPriceInEth = 10000000000000, startTime = block.timestamp at consctruction" ,
            async () => {
                const eventArgs = await platform.queryFilter("SaleRoundStart", 1);
                expect(eventArgs[0].args[0]).to.be.equal(BigNumber.from("1"))
                expect(eventArgs[0].args[1]).to.be.equal(BigNumber.from("100000000000000000000000"))
                expect(eventArgs[0].args[2]).to.be.equal(BigNumber.from("10000000000000"))
                expect(eventArgs[0].args[3]).to.be.equal(constructionTimestamp)
            }
        )
    })

    describe("referral system:", async () => {
        it("referral can be registered", async () => {
            await platform.connect(adr2).becomeAReferral()
            await platform.connect(adr3).becomeAReferral()
            const success2 = await platform.isReferral(adr2.address);
            const success3 = await platform.isReferral(adr3.address);
            expect(success2).to.be.true
            expect(success3).to.be.true
        })
        
        it("becomeAReferral() reverts if the user has already registered as referral", async () => {
            await expect(
                platform.connect(adr2).becomeAReferral()
            ).to.be.revertedWith("You are already registered as referral")
        })

        it("registerAReferral(_address) reverts if _address is address(0)", async () => {
            await expect(
                platform.registerAReferral(adr0)
            ).to.be.revertedWith(
                    "Referral can't be an address zero, yourself and must be registered as a referral to be one"
            )
        })

        it("registerAReferral(_address) reverts if _address is msg.sender", async () => {
            await expect(
                platform.connect(adr2).registerAReferral(adr2.address)
            ).to.be.revertedWith(
                    "Referral can't be an address zero, yourself and must be registered as a referral to be one"
            )
        })

        it("registerAReferral(_address) reverts if _address is not yet registered as a referral", async () => {
            await expect(
                platform.registerAReferral(adr0)
            ).to.be.revertedWith(
                    "Referral can't be an address zero, yourself and must be registered as a referral to be one"
            )
        })

        it("buyTokensFromContract() will not distrubute fees if no referrals were set", async () => {
            const tkAmountToBuy = 777;
            const theOrder = await platform.orderIdToOrder(0);
            const ethToPay = firstTokenPrice.mul(tkAmountToBuy);
            
            await platform.connect(owner).buyTokensFromContract(
                tokensAmount(tkAmountToBuy),
                {value: ethToPay}
            )
            await platform.connect(owner).registerAReferral(adr2.address)
            await platform.connect(owner).buyTokensFromContract(
                tokensAmount(tkAmountToBuy),
                {value: ethToPay}
            )
        })

        it("registerAReferral(_address) sets _address as msg.sender's referral and emits an event", async () => {
            await expect(
                platform.connect(adr1).registerAReferral(adr2.address)
            ).to.emit(platform, "ReferralSet")
            .withArgs(adr1.address, adr2.address)
            
            const referral = await platform.referrals(adr1.address);
            await expect(referral).to.be.equal(adr2.address)
        })

        it("registerAReferral(_address) reverts if user have already set his referral", async () => {
            await expect(
                platform.connect(adr1).registerAReferral(adr1.address)
            ).to.be.revertedWith("You've already set a referral")
        })

        it("registerAReferral(_address) does not allow to set a referral someone who has you as referral", async () => {
            await expect(
                platform.connect(adr2).registerAReferral(adr1.address)
            ).to.be.revertedWith(
                "You can't set someone who has you as referral as your referral"
            )
        })
    })

    describe("SALE ROUND:", async () => {
        it("buyTokensFromContract() can not be called if round time has passed", async () => {
            const {Platform} = await loadFixture(fixture);
            await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60])
            const tkAmount = 100;
            const ethAmount = firstTokenPrice.mul(tkAmount);
            await expect(
                buyTokensFromContract(tkAmount, ethAmount, Platform)
            ).to.be.revertedWith("Time for this round has past but the round was not changed")
        })

        it("buyTokensFromContract() can not be called during trade round", async() => {
            await platform.startTradeRound()
            const tkAmount = 100;
            const ethAmount = firstTokenPrice.mul(tkAmount);
            await expect(
                buyTokensFromContract(tkAmount, ethAmount, platform)
            ).to.be.revertedWith("This function can not be called during this round")
        })

        it("buyTokensFromContract() will revert if there is not enough tokens to buy", async () => {
            const {Platform} = await loadFixture(fixture);
            const tkAmount = Number(ethers.utils.formatUnits(await Platform.availableTokensThisRound(), 18)) - 100;
            const ethAmount = firstTokenPrice.mul(Number(tkAmount));
            await buyTokensFromContract(tkAmount, ethAmount, Platform)
            await expect(
                buyTokensFromContract(tkAmount, ethAmount, Platform)
            ).to.be.revertedWith("There is not enough tokens to fill your order")
        })
        
        it("buyTokensFromContract() will revert if there was not enought eth sent", async () => {
            const tkAmount = 100;
            const ethAmount = firstTokenPrice.mul(tkAmount - 1);
            await expect(
                buyTokensFromContract(tkAmount, ethAmount, platform)
            ).to.be.revertedWith("You are sending not enough ETH to fill your order")
        })

        it("buyTokensFromContract() edits boughtTokensThisRound and ethAccumulatedDuringSaleRound properly", async () => {
            const {Platform} = await loadFixture(fixture);
            const tkAmount = 100;
            const ethAmount = firstTokenPrice.mul(tkAmount);
            const boughtTokensThisRound0 = await Platform.boughtTokensThisRound();
            const ethAccumulatedDuringSaleRound0 = await Platform.ethAccumulatedDuringSaleRound();
            // first buy
            await buyTokensFromContract(tkAmount, ethAmount, Platform)
            const boughtTokensThisRound1 = await Platform.boughtTokensThisRound();
            const ethAccumulatedDuringSaleRound1 = await Platform.ethAccumulatedDuringSaleRound();
            expect(boughtTokensThisRound1).to.be.equal(boughtTokensThisRound0.add(tokensAmount(100)))
            expect(ethAccumulatedDuringSaleRound1).to.be.equal(ethAccumulatedDuringSaleRound0.add(ethAmount))
            //second buy
            await buyTokensFromContract(tkAmount, ethAmount, Platform)
            const boughtTokensThisRound2 = await Platform.boughtTokensThisRound();
            const ethAccumulatedDuringSaleRound2 = await Platform.ethAccumulatedDuringSaleRound();
            expect(boughtTokensThisRound2).to.be.equal(boughtTokensThisRound1.add(tokensAmount(100)))
            expect(ethAccumulatedDuringSaleRound2).to.be.equal(ethAccumulatedDuringSaleRound1.add(ethAmount))
        })

        it("buyTokensFromContract() distributes tokens and fees emitting necessary events", async () => {
            const roundNumber = await platform.roundNumber();
            const tkAmount = 100;
            const ethAmount = firstTokenPrice.mul(tkAmount);
            const initTokenBalance = await token.balanceOf(adr1.address);
            const firstReferralFee = ethAmount.div(BigNumber.from(1000)).mul(BigNumber.from(50));
            const secondReferralFee = ethAmount.div(BigNumber.from(1000)).mul(BigNumber.from(30));

            //checking emitted events and eth balance change
            await platform.connect(adr2).registerAReferral(adr3.address);
            await expect(
                await platform.connect(adr1).buyTokensFromContract(tokensAmount(tkAmount), {value: ethAmount})
            ).to.emit(platform, "TokensBoughtFromSale")
            .withArgs(BigNumber.from(roundNumber), adr1.address, tokensAmount(tkAmount))
            .and.to.emit(platform, "FeeTransferredToReferral")
            .withArgs(adr2.address, firstReferralFee)
            .and.to.emit(platform, "FeeTransferredToReferral")
            .withArgs(adr3.address, secondReferralFee)
            .and.to.emit(token, "Transfer")
            .withArgs(platform.address, adr1.address, tokensAmount(tkAmount))
            .and.to.changeEtherBalances(
                [adr1, adr2, adr3],
                [-ethAmount, firstReferralFee, secondReferralFee]
            )

            //checking token balance change
            expect(
                await token.balanceOf(adr1.address)
            ).to.be.equal(initTokenBalance.add(tokensAmount(100)))
        })

        it("buyTokensFromContract() buying again to make sure everything works well", async () => {
            const roundNumber = await platform.roundNumber();
            const tkAmount = 100;
            const ethAmount = firstTokenPrice.mul(tkAmount);
            const initTokenBalance = await token.balanceOf(adr1.address);
            const firstReferralFee = ethAmount.div(BigNumber.from(1000)).mul(BigNumber.from(50));
            const secondReferralFee = ethAmount.div(BigNumber.from(1000)).mul(BigNumber.from(30));

            //checking emitted events and eth balance change
            await expect(
                await platform.connect(adr1).buyTokensFromContract(tokensAmount(tkAmount), {value: ethAmount})
            ).to.emit(platform, "TokensBoughtFromSale")
            .withArgs(BigNumber.from(roundNumber), adr1.address, tokensAmount(tkAmount))
            .and.to.emit(platform, "FeeTransferredToReferral")
            .withArgs(adr2.address, firstReferralFee)
            .and.to.emit(platform, "FeeTransferredToReferral")
            .withArgs(adr3.address, secondReferralFee)
            .and.to.emit(token, "Transfer")
            .withArgs(platform.address, adr1.address, tokensAmount(tkAmount))
            .and.to.changeEtherBalances(
                [adr1, adr2, adr3],
                [-ethAmount, firstReferralFee, secondReferralFee]
            )

            //checking token balance change
            expect(
                await token.balanceOf(adr1.address)
            ).to.be.equal(initTokenBalance.add(tokensAmount(100)))
        })
    })

    describe("TRADE ROUND:", async () => {
        it("startTradeRound() can only be called by platform admin, it changes required fields and emits proper events", async () => {
            const { Platform, Token } = await loadFixture(fixture);
            const tkAmount = 45000;
            const ethAmount = firstTokenPrice.mul(tkAmount);
            const roundNumber = await Platform.roundNumber();

            await expect(
                Platform.connect(adr1).startTradeRound()
            ).to.be.revertedWith(
                "AccessControl: account 0x70997970c51812dc3a010c7d01b50e0d17dc79c8 is missing role 0x0000000000000000000000000000000000000000000000000000000000000000"
            )

            await Platform.connect(adr1).buyTokensFromContract(tokensAmount(tkAmount), {value: ethAmount})

            await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60])
            
            // startTradeRound() emits events with proper arguments
            expect(
                await Platform.startTradeRound()
            ).to.emit(Platform, "SaleRoundFinish")
            .withArgs(
                roundNumber,
                await Platform.boughtTokensThisRound(),
                await Platform.burnedTokensThisRound(),
                BigNumber.from("450000000000000000"),
                await (await provider.getBlock(await provider.getBlockNumber())).timestamp
            )
            .and.to.emit(Platform, "TradeRoundStart")
            .withArgs(
                roundNumber,
                await (await provider.getBlock(await provider.getBlockNumber())).timestamp
            )
            .and.to.emit(Token, "Transfer")
            .withArgs(Platform.address, adr0, await Platform.burnedTokensThisRound())

            expect(
                await Platform.contractState()
            ).to.be.equal(2)

            const availableTokensThisRound = await Platform.availableTokensThisRound();
            const boughtTokensThisRound = await Platform.boughtTokensThisRound();
            const burnedTokensThisRound = availableTokensThisRound.sub(boughtTokensThisRound);
            const timestamp = await (await provider.getBlock(await provider.getBlockNumber())).timestamp;
            expect(
                await Platform.burnedTokensThisRound()
            ).to.be.equal(burnedTokensThisRound)
            expect(
                await Platform.ethAmountTradedDuringTradeRound()
            ).to.be.equal(0)
            expect(
                await Platform.roundEndsAt()
            ).to.be.equal(timestamp + (3 * 24 * 60 * 60))
        })

        it("startTradeRound() can not be called during TRADE round", async () => {
            await platform.startTradeRound()
            await expect(
                platform.startTradeRound()
            ).to.be.revertedWith("This function can not be called during this round")
        })
        
        it("startTradeRound() can be changed earlier if all tokens were bought ", async () => {
            const { Platform } = await loadFixture(fixture);
            const totalTkAmount = Number(ethers.utils.formatUnits(await Platform.availableTokensThisRound(), 18));
            await Platform.buyTokensFromContract(tokensAmount(totalTkAmount), {value: firstTokenPrice.mul(totalTkAmount)})
            expect(await Platform.boughtTokensThisRound()).to.be.equal("100000000000000000000000")
            const latestTimestamp = await provider.getBlock("latest");
            expect(
                Number(await Platform.roundEndsAt())
            ).to.be.above(
                Number(latestTimestamp.timestamp)
            )
            await Platform.startTradeRound()
            expect(await Platform.contractState()).to.be.equal(2)
        })

        it("startTradeRound() can not be called if the time is less than roundEndsAt", async () => {
            const { Platform } = await loadFixture(fixture);
            await expect(
                Platform.startTradeRound()
            ).to.be.revertedWith("Previous round is not ended yet")
        })

        it("createSellOrder() can not be called during SALE round or when time for TRADE round has passed", async () => {
            const { Platform, Provider } = await loadFixture(fixture)
            await expect(
                Platform.createSellOrder(100, 100)
            ).to.be.revertedWith("This function can not be called during this round")
            await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60])
            await expect(
                Platform.createSellOrder(100, 100)
            ).to.be.revertedWith("Time for this round has past but the round was not changed")
        })

        it("createSellOrder() can not be called with 0 tokens provided or with 0 wei as token price", async () => {
            const { Platform, Token } = await loadFixture(fixture)
            platform = Platform;
            token = Token;
            const tkAmount = 25000;
            const tkAmount2 = 35000;
            const ethAmount = firstTokenPrice.mul(tkAmount);
            const ethAmount2 = firstTokenPrice.mul(tkAmount2)
            await platform.connect(adr1).buyTokensFromContract(tokensAmount(tkAmount), {value: ethAmount})
            await platform.connect(adr2).buyTokensFromContract(tokensAmount(tkAmount2), {value: ethAmount2})
            await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60])
            await platform.startTradeRound()
            await expect(
                platform.connect(adr1).createSellOrder(0, ethers.utils.parseEther("0.2"))
            ).to.be.revertedWith("You can't create an order for 0 tokens")
            await expect(
                platform.connect(adr1).createSellOrder(tokensAmount(5000), 0)
            ).to.be.revertedWith("You can't set price per token as 0")

        })

        it("createSellOrder() transfer tokens to platform, saves order data and emits events", async () => {
            const tkAmount = 5000;
            const ethAmount = ethers.utils.parseEther("0.2")
            await token.connect(adr1).approve(platform.address, tokensAmount(tkAmount))
            await expect(
                platform.connect(adr1).createSellOrder(tokensAmount(tkAmount), ethAmount)
            ).to.emit(token, "Transfer")
            .withArgs(adr1.address, platform.address, tokensAmount(tkAmount))
            .and.to.emit(platform, "NewSellOrder")
            .withArgs(
                await platform.lastOrderId(),
                tokensAmount(tkAmount),
                ethAmount
            )
            const lastOrder = await platform.orderIdToOrder(0);
            expect(lastOrder[0]).to.be.equal(1)
            expect(lastOrder[1]).to.be.equal(tokensAmount(tkAmount))
            expect(lastOrder[2]).to.be.equal(0)
            expect(lastOrder[3]).to.be.equal(ethAmount)
            expect(lastOrder[4]).to.be.equal(adr1.address)
        })

        it("buyTokensFromOrder() will revert if there is no order with given ID", async () => {
            await expect(
                platform.buyTokensFromOrder(1, 5000)
            ).to.be.revertedWith("Order does not exist, already filled or there is not enough tokens")
        })

        it("buyTokensFromOrder() will revert if there was not enough eth provided for a buy", async () => {
            const tkAmountToBuy = 5;
            const theOrder = await platform.orderIdToOrder(0);
            await expect(
                platform.connect(adr2).buyTokensFromOrder(
                    0,
                    tokensAmount(tkAmountToBuy),
                    {value: theOrder[3].mul(tkAmountToBuy - 1)}
                )
            ).to.be.revertedWith("You are paying not enough ETH")
        })

        it("buyTokensFromOrder() will edit round data, distibute fees, send orderCreator eth, send tokens to buyer and emit necessary events", async () => {
            const tkAmountToBuy = 777;
            const theOrder = await platform.orderIdToOrder(0);
            const ethToPay = BigNumber.from(theOrder[3].mul(tkAmountToBuy));
            
            await platform.connect(adr2).becomeAReferral()
            await platform.connect(adr3).becomeAReferral()
            await platform.connect(adr1).registerAReferral(adr2.address)
            await platform.connect(adr2).registerAReferral(adr3.address)
            
            await expect(
                await platform.connect(owner).buyTokensFromOrder(
                    0,
                    tokensAmount(tkAmountToBuy),
                    {value: ethToPay}
                )
            )
            .to.changeEtherBalances(
                [owner, adr1, adr2, adr3],
                [
                    ethToPay.sub(ethToPay.mul(2)),
                    ethToPay.div(1000).mul(950),
                    ethToPay.div(1000).mul(25),
                    ethToPay.div(1000).mul(25)
                ]
            )
            .and.to.emit(platform, "FeeTransferredToReferral")
            .withArgs(adr2.address, ethToPay.div(1000).mul(25))
            .and.to.emit(platform, "FeeTransferredToReferral")
            .withArgs(adr3.address, ethToPay.div(1000).mul(25))
            .and.to.emit(platform, "TokensBoughtFromOrder")
            .withArgs(0, adr1.address, tokensAmount(tkAmountToBuy), theOrder[3])
            .and.to.emit(token, "Transfer")
            .withArgs(platform.address, owner.address, tokensAmount(tkAmountToBuy))

            expect(await platform.ethAmountTradedDuringTradeRound()).to.be.equal(ethToPay)

            // check token balances
            expect(
                await token.balanceOf(owner.address)
            ).to.be.equal(tokensAmount(tkAmountToBuy))

            const updatedOrder = await platform.orderIdToOrder(0);

            expect(updatedOrder[2]).to.be.equal(theOrder[2].add(tokensAmount(tkAmountToBuy)))
        })

        it("if buyTokensFromOrder() buys all tokens from it, later calls to this order will be reverted", async () => {
            const theOrder = await platform.orderIdToOrder(0);
            const availableTokensInOrder = theOrder[1].sub(theOrder[2]);
            
            await platform.buyTokensFromOrder(
                0,
                availableTokensInOrder,
                {value: theOrder[3].mul(Number(ethers.utils.formatUnits(availableTokensInOrder, 18)))}
            )

            await expect(
                platform.buyTokensFromOrder(
                    0,
                    tokensAmount(5),
                    {value: theOrder[3].mul(5)}
                )
            ).to.be.revertedWith("Order does not exist, already filled or there is not enough tokens")
        })
    })

    describe("startSaleRound():", async () => {
        it("startSaleRound() can be called only by ADMIN", async () => {
            await expect(
                platform.connect(adr1).startSaleRound()
            ).to.be.revertedWith(
                "AccessControl: account 0x70997970c51812dc3a010c7d01b50e0d17dc79c8 is missing role 0x0000000000000000000000000000000000000000000000000000000000000000"
            )
        })

        it("startSaleRound() can not be called if time hasn't come", async () => {
            await expect(
                platform.connect(owner).startSaleRound()
            ).to.be.revertedWith("Previous round is not ended yet")
        })

        // saleRoundTokenPrice = getNextRoundTokenPrice(saleRoundTokenPrice);
        // availableTokensThisRound = ethAmountTradedDuringTradeRound * 10**18 / saleRoundTokenPrice;
        // ethAccumulatedDuringSaleRound = 0;
        // boughtTokensThisRound = 0;
        // burnedTokensThisRound = 0;
        // roundEndsAt = block.timestamp + roundDuration;
        // contractState = ContractState.SALE;

        // FrrankToken(targetTokenAddress).mint(address(this), availableTokensThisRound);

        // emit TradeRoundFinish(roundNumber - 1, ethAmountTradedDuringTradeRound, block.timestamp);
        // emit SaleRoundStart(roundNumber, availableTokensThisRound, saleRoundTokenPrice, block.timestamp);
        it("startSaleRound() starts SALE round, edits necessary data and emits proper events", async () => {
            const ethAmountTradedDuringTradeRound = await platform.ethAmountTradedDuringTradeRound();
            const prevTokenPrice = Number(await platform.saleRoundTokenPrice());

            await provider.send("evm_increaseTime", [3*24*60*60])
            await expect(
                await platform.startSaleRound()
            )
            .to.emit(platform, "TradeRoundFinish")
            .withArgs(
                await platform.roundNumber() - 1,
                ethAmountTradedDuringTradeRound,
                await (await provider.getBlock(await provider.getBlockNumber())).timestamp
            )
            .and.to.emit(platform, "SaleRoundStart")
            .withArgs(
                await platform.roundNumber(),
                await platform.availableTokensThisRound(),
                await platform.saleRoundTokenPrice(),
                await (await provider.getBlock(await provider.getBlockNumber())).timestamp
            )
            .and.to.emit(token, "Transfer")
            .withArgs(
                adr0,
                platform.address,
                await platform.availableTokensThisRound()
            )

            expect(
                await platform.availableTokensThisRound()
            ).to.be.equal(
                (await platform.ethAmountTradedDuringTradeRound())
                .mul("1000000000000000000")
                .div(await platform.saleRoundTokenPrice())
            )
            expect(await platform.saleRoundTokenPrice()).to.be.equal(await platform.getNextRoundTokenPrice(prevTokenPrice))
            expect(await platform.ethAccumulatedDuringSaleRound()).to.be.equal(0)
            expect(await platform.boughtTokensThisRound()).to.be.equal(0)
            expect(await platform.ethAccumulatedDuringSaleRound()).to.be.equal(0)
            expect(await platform.contractState()).to.be.equal(1)
        })

        it("startSaleRound() can not be called during SALE round", async () => {
            await expect(
                platform.connect(owner).startSaleRound()
            ).to.be.revertedWith("This function can not be called during this round")
        })

        it("getReferralOf() returns a referral of the given address", async () => {
            await expect(await platform.getReferralOf(adr1.address))
            .to.be.equal(adr2.address)
        })

        it("", async () => {
            
        })

        it("", async () => {
            
        })
    })
})