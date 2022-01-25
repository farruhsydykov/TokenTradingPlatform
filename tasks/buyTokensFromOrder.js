const fs = require("fs");
require("dotenv").config();
const dotenv = require("dotenv");
const { ethers } = require("ethers");

task("buyTokensFromOrder", "Lets you buy given amount of tokens from the order with given orderId")
    .addParam("orderid", "Id of the order to buy tokens from")
    .addParam("tokensamount", "Amount of tokens to buy")
    .addOptionalParam("privatekey", "Private key of address which is going to sign the transaction")
    .setAction(async (args) => {
        const network = hre.network;
        let networkEnv = dotenv.parse(fs.readFileSync(`.env-${network.name}`));

        const platform = await hre.ethers.getContractAt("TradingPlatform", networkEnv.PLATFORM_ADDRESS);
        const provider = await new hre.ethers.providers.JsonRpcProvider(network.config.url)
        let signer;
        if (args.privatekey) {
            signer = new hre.ethers.Wallet(args.privatekey, provider);
        } else [signer] = await hre.ethers.getSigners();

        const order = await platform.orderIdToOrder(args.orderid);
        const tkAmount = Number(args.tokensamount);
        const tkAmountBigNum = ethers.utils.parseUnits(tkAmount.toString(), 18);
        const tokenPriceInOrder = order[3];

        const success = await platform.connect(signer).buyTokensFromOrder(
            Number(args.orderid),
            tkAmountBigNum,
            {value: tokenPriceInOrder.mul(tkAmount)}
        );
        console.log(success ? "Tokens are successfully bought" : "Something went wrong")
    })