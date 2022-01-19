const fs = require("fs");
require("dotenv").config();
const dotenv = require("dotenv");

task("startTradeRound", "Start trade round")
    .addOptionalParam("privatekey", "Private key of address which is going to sign the transaction")
    .setAction(async (args) => {
        const network = hre.network;
        let networkEnv = dotenv.parse(fs.readFileSync(`.env-${network.name}`));

        const provider = await new hre.ethers.providers.JsonRpcProvider(network.config.url)
        let signer;
        if (args.privatekey) {
            signer = new hre.ethers.Wallet(args.privatekey, provider);
        } else [signer] = await hre.ethers.getSigners();

        const platform = await hre.ethers.getContractAt("TradingPlatform", networkEnv.PLATFORM_ADDRESS);
        let success = await platform.connect(signer).startTradeRound();
        console.log(success ? "Trade round was set" : "Something went wrong")
    })