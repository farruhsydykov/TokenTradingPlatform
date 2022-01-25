require("dotenv").config();
require("@nomiclabs/hardhat-waffle");
require("./tasks/tasks.js");
require('solidity-coverage');
require('hardhat-contract-sizer');

let mnemonic = process.env.MNEMONIC;

module.exports = {
  defaultNetwork: "hardhat",

  networks: {
    hardhat: {
      // forking: {
      //   url: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      //   blockNumber: 9899970
      // }
    },

    localhost: {
      url: "http://localhost:8545"
    },
    
    bsc_testnet: {
      accounts: {
        count: 3,
        mnemonic
      },
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97
    },

    bsc_mainnet: {
      accounts: {
        count: 3,
        mnemonic
      },
      url: "https://bsc-dataseed.binance.org/",
      chainId: 56
    },

    rinkeby: {
      accounts: {
        count: 3,
        mnemonic
      },
      url: `https://eth-rinkeby.alchemyapi.io/v2/${process.env.ALCHEMY_API_KEY}`,
      chainId: 4
    }
  },

  // etherscan: {
  //   apiKey: process.env.ETHERSCAN_API
  // },

  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    // only: [":TradingPlatform$", ":FrrankToken$"],
    only: [],
  },

  solidity: {
    version: "0.8.10",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  }
};