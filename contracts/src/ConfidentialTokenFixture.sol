// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.28;

import {FHE, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {ERC7984} from "@openzeppelin/confidential-contracts/token/ERC7984/ERC7984.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @dev Local Hardhat fixture only. Sepolia deployments are locked to Zama's
/// official cUSDTMock wrapper in scripts/deploy.cjs.
contract ConfidentialTokenFixture is ERC7984, Ownable, ZamaEthereumConfig {
    constructor(address initialOwner)
        ERC7984("Test Confidential USDT", "cUSDTFixture", "")
        Ownable(initialOwner)
    {}

    function mint(address to, externalEuint64 encryptedAmount, bytes calldata inputProof) external onlyOwner {
        _mint(to, FHE.fromExternal(encryptedAmount, inputProof));
    }
}
