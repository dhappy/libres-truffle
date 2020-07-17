import React, { useState, useEffect } from 'react'
import SimpleStorageContract from './contracts/SimpleStorage.json'
import getWeb3 from './getWeb3'

import "./App.css";

export default () => {
  const [state, updateState] = useState({ storageValue: 0, web3: null, accounts: null, contract: null })

  const setState = (newState) => {
    updateState(state => Object.assign({}, state, newState))
  }

  const setup = async () => {
    try {
      // Get network provider and web3 instance.
      const web3 = await getWeb3()

      // Use web3 to get the user's accounts.
      const accounts = await web3.eth.getAccounts()

      // Get the contract instance.
      const networkId = await web3.eth.net.getId()
      const deployedNetwork = SimpleStorageContract.networks[networkId]
      const instance = new web3.eth.Contract(
        SimpleStorageContract.abi,
        deployedNetwork && deployedNetwork.address,
      )

      // Set web3, accounts, and contract to the state, and then proceed with an
      // example of interacting with the contract's methods.
      setState({ web3, accounts, contract: instance })
    } catch (error) {
      // Catch any errors for any of the above operations.
      alert(
        `Failed to load web3, accounts, or contract. Check console for details.`,
      )
      console.error(error)
    }
  }

  useEffect(() => { setup() }, [])

  const updateValue = async (value) => {
    const { accounts, contract } = state

    // Stores a given value, 5 by default.
    await contract.methods.set(value).send({ from: accounts[0] });

    // Get the value from the contract to prove it worked.
    const response = await contract.methods.get().call()

    // Update state with the result.
    setState({ storageValue: response })
  }

  const randValue = () => {
    updateValue(Math.floor(1000 * Math.random()))
  }

  if (!state.web3) {
    return <div>Loading Web3, accounts, and contract…</div>
  }

  return (
    <div className="App">
      <h2>Smart Contract Example</h2>
      <button onClick={randValue}>Random Value</button>
      <p>The stored value is: {state.storageValue}</p>
    </div>
  )
}