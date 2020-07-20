// SPDX-License-Identifier: MIT
pragma solidity >=0.4.21 <0.7.0;
pragma experimental ABIEncoderV2;

import "@aragon/os/contracts/apps/AragonApp.sol";

contract PathMap is AragonApp {
  struct CID {
    string codec;
    uint8[] multihash;
  }
  //mapping(string => CID) public paths;
  mapping(uint256 => CID) public paths;

  //function set(string memory path, string memory codec, uint8[] memory multihash) public {
  function set(uint256 pathhash, string memory codec, uint8[] memory multihash) public {
    paths[pathhash] = CID(codec, multihash);
  }

  //function get(string memory path) public view returns (CID memory) {
  function get(uint256 pathhash) public view returns (CID memory) {
    return paths[pathhash];
  }
}
