const fs = require("fs");
const dotenv = require("dotenv");
const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");
const { BigNumber } = require("ethers");


describe("Token trading platform:", async () => {
    // let network = hre.network;
    // let networkEnv = dotenv.parse(fs.readFileSync(`.env-${network.name}`));
    // const PLATFORM_ADDRESS = networkEnv.PLATFORM_ADDRESS;
    // const TOKEN_ADDRESS = networkEnv.TOKEN_ADDRESS;

    // // const provider = ethers.providers.JsonRpcProvider(network.config.url);
    // const platform = ethers.getContractAt("TradingPlatform", PLATFORM_ADDRESS);
    // const token = ethers.getContractAt("FrrankToken", TOKEN_ADDRESS);
    // const [owner, adr1, adr2] = await hre.ethers.getSigners();

    let owner, adr1, adr2, adr3, Platform, platform, token, provider;

    before(async () => {
        provider = waffle.provider;
        // [owner, adr1, adr2, adr3] = await hre.ethers.getSigners();
        [owner, adr1, adr2, adr3] = await ethers.getSigners();
        Platform = await ethers.getContractFactory("TradingPlatform");
        platform = await Platform.deploy("TOKEN_NAME", "TN");
        token = await ethers.getContractAt("FrrankToken", await platform.targetTokenAddress());
    })

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
    })

    // describe("First buyTokensFromContract() function check (during sale round):", async () => {
    //     it("", async () => {
    //         let initialEthBalance = await provider.getBalance(owner.address);

    //         const options = {value: ethers.utils.parseEther("0.5")}
    //         // const receipt = await platform.buyTokensFromContract(ethers.utils.parseUnits("50000", 18), options);
            
    //         expect(await platform.connect(owner).buyTokensFromContract(ethers.utils.parseUnits("50000", 18), options))
    //         .to.changeEtherBalance(owner, ethers.utils.parseEther("-0.5"));

    //         let newEthBalance = await provider.getBalance(owner.address)
            
    //         console.log(`${initialEthBalance}\n${newEthBalance}`)
    //     })
    // })
})