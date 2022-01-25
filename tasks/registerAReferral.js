const fs = require("fs");
require("dotenv").config();
const dotenv = require("dotenv");
const { ethers } = require("ethers");

task("registerAReferral", "Registers a given address as a referral for the caller")
    .addParam("address", "Address that will be set as a referral for caller")
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

        const success = await platform.connect(signer).registerAReferral(args.address);
        console.log(success ? `${args.address} became a referral for ${signer.address}` : "Something went wrong")
    })