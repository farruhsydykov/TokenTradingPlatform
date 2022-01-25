const fs = require("fs");
require("dotenv").config();
const dotenv = require("dotenv");
const { ethers } = require("ethers");

task("getReferralOf", "Returns a referral of a given address")
    .addParam("address", "Address who's referral to return")
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

        const success = await platform.connect(signer).getReferralOf(args.address);
        console.log(success)
    })