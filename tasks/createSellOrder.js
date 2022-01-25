const fs = require("fs");
require("dotenv").config();
const dotenv = require("dotenv");
const { ethers } = require("ethers");

task("createSellOrder", "Creates sell order with given amount of tokens and price in wei per token")
    .addParam("tokensamount", "Amount of tokens for order")
    .addParam("priceinweipertoken", "Price in wei for one token")
    .addOptionalParam("privatekey", "Private key of address which is going to sign the transaction")
    .setAction(async (args) => {
        const network = hre.network;
        const networkEnv = dotenv.parse(fs.readFileSync(`.env-${network.name}`));
        const tkAmount = ethers.utils.parseUnits(args.tokensamount, 18);
        const pricePerToken = Number(args.priceinweipertoken);

        const platform = await hre.ethers.getContractAt("TradingPlatform", networkEnv.PLATFORM_ADDRESS);
        const provider = await new hre.ethers.providers.JsonRpcProvider(network.config.url)
        let signer;
        if (args.privatekey) {
            signer = new hre.ethers.Wallet(args.privatekey, provider);
        } else [signer] = await hre.ethers.getSigners();

        const success = await platform.connect(signer).createSellOrder(tkAmount, pricePerToken);
        console.log(success ? "Order created successfully" : "Something went wrong")
    })