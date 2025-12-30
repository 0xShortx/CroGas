require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    cronosTestnet: {
      url: "https://evm-t3.cronos.org/",
      chainId: 338,
      accounts: [process.env.RELAYER_PRIVATE_KEY || "0xd6e09f02d1698fae4cc2f4a561ee62b06d15d895bb418da8c6a126118020b64e"],
    },
  },
};
