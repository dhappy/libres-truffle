// SPDX-License-Identifier: MIT
pragma solidity >=0.4.21 <0.7.0;
pragma experimental ABIEncoderV2;

contract PathMap {
  struct CID {
    string codec;
    uint8[] multihash;
  }
  mapping(string => CID) public paths;

  function set(string memory path, string memory codec, uint8[] memory multihash) public {
    paths[path] = CID(codec, multihash);
  }

  function get(string memory path) public view returns (CID memory) {
    return paths[path];
  }
}
