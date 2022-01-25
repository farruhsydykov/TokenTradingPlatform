const fs = require("fs");
require("dotenv").config();
const dotenv = require("dotenv");

task("getTargetTokenAddress", "Shows and save to network .env an address of the token for trading platform")
    // .addParam("address", "Address of the trading platform")
    .setAction(async () => {
        const network = hre.network;
        let networkEnv = dotenv.parse(fs.readFileSync(`.env-${network.name}`));

        const provider = await new hre.ethers.providers.JsonRpcProvider(network.config.url)
        let [signer] = await hre.ethers.getSigners();

        const platform = await hre.ethers.getContractAt("TradingPlatform", networkEnv.PLATFORM_ADDRESS);

        let targetTokenAddress = await platform.targetTokenAddress();
        console.log(targetTokenAddress)
    })