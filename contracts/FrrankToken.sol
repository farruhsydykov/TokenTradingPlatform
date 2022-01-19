// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../node_modules/@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../node_modules/@openzeppelin/contracts/access/AccessControl.sol";

contract FrrankToken is ERC20, AccessControl {   
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    constructor(
        string memory _name,
        string memory _symbol,
        address _owner,
        address _tradingPlatformAddress
    )
        ERC20(_name, _symbol)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, _owner);

        _grantRole(MINTER_ROLE, _tradingPlatformAddress);
        _grantRole(BURNER_ROLE, _tradingPlatformAddress);
    }

    function mint(address _account, uint256 _amount) external onlyRole(MINTER_ROLE){
        _mint(_account, _amount);
    }

    function burn(address _account, uint256 _amount) external onlyRole(BURNER_ROLE){
        _burn(_account, _amount);
    }
}