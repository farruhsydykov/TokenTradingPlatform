const fs = require("fs");
require("dotenv").config();
const dotenv = require("dotenv");
const { ethers } = require("ethers");

task("buyTokensFromContract", "Buy tokens for eth from contract during sale round")
    .addParam("tokensamount", "Tokens amount to buy from contract during sale round")
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

        let tokenAmount = hre.ethers.utils.parseUnits(`${args.tokensamount}`, 18);
        let tokenPriceInWei = await platform.connect(signer).saleRoundTokenPrice();
        console.log(`Current token price: ${ethers.utils.formatEther(tokenPriceInWei)}`)
        
        let ethAmountToTransferForTokens = args.tokensamount * ethers.utils.formatUnits(tokenPriceInWei, 18);
        console.log(`Amount of ETH to pay for tokens: ${ethAmountToTransferForTokens}`)

        let options = {value: ethers.utils.parseEther(`${ethAmountToTransferForTokens}`)}
        let success = await platform.connect(signer).buyTokensFromContract(tokenAmount, options);
        console.log(success ? "Sale round was set" : "Something went wrong")
    })