import React, { useState, useEffect } from 'react'
import CID from 'cids'
import PathMapContract from './contracts/PathMap.json'
import getWeb3 from './getWeb3'

import "./App.css";

export default () => {
  const [state, updateState] = useState({ storageValue: 0, web3: null, accounts: null, contract: null })
  const [path, setPath] = useState('/book/by/Aldous Huxlex/Island/')
  const [cid, setCID] = useState('QmR6s9BpKfUiefvZckdyAYuvkh2zGp4kPPdxFeXYKsCtFQ')

  const setState = (newState) => {
    updateState(state => Object.assign({}, state, newState))
  }

  const setup = async () => {
    try {
      const web3 = await getWeb3()
      const accounts = await web3.eth.getAccounts()
      const networkId = await web3.eth.net.getId()
      const deployedNetwork = PathMapContract.networks[networkId]

      if(!deployedNetwork) {
        alert(`Contract address not found for network #${networkId}`)
        return
      }

      const abi = PathMapContract.abi
      const instance = new web3.eth.Contract(
        abi, deployedNetwork && deployedNetwork.address
      )

      setState({ web3, accounts, contract: instance })
    } catch (error) {
      alert(
        `Failed to load web3, accounts, or contract. Check console for details.`,
      )
      console.error(error)
    }
  }

  useEffect(() => { setup() }, [])

  const getValue = async () => {
    const { web3, accounts, contract } = state
    const response = await contract.methods.get(path).call()
    console.log(response)

    const result = new CID(1, response.codec, Buffer.from(response.multihash))
    console.log(result)

    setState({ storageValue: result.toString() })
  }

  const updateMap = async (path, value) => {
    try {
      const { web3, accounts, contract } = state

      console.log(contract)

      const cid = new CID(value)
      console.log(cid)

      const tx = (await
        contract.methods
        .set(path, cid.codec, Array.from(cid.multihash))
        .send({ from: accounts[0] })
      )
      console.log(tx)

      getValue()
    } catch(err) {
      alert(err.message)
      console.error(err)
    }
  }

  const setMap = (evt) => {
    evt.preventDefault()
    updateMap(path, cid)
  }

  if (!state.web3) {
    return <div>Loading Web3, accounts, and contract…</div>
  }

  return (
    <div className='RTCID'>
      <h2>Round Trip Content Identifier</h2>
      <form onSubmit={setMap}>
        <ul>
          <li><b>Path:</b> <input type='text' value={path} onChange={evt => setPath(evt.target.value)}/></li>
          <li><b>CID:</b> <input type='text' value={cid} onChange={evt => setCID(evt.target.value)}/></li>
          <li><input type='button' onClick={getValue} value='Get Value'/> <input type='submit' value='Set Value'/></li>
        </ul>
      </form>
      <p>The stored value is: <a href={`//ipfs.io/ipfs/${state.storageValue}`}>{state.storageValue}</a></p>
    </div>
  )
}