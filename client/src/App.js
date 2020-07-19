import React, { useState, useEffect } from 'react'
import CID from 'cids'
//import { encodeCallScript } from '@aragon/test-helpers/evmScript'
//import { encodeActCall, execAppMethod } from '@aragon/toolkit'
import web3EthAbiUntyped, { AbiCoder } from 'web3-eth-abi'
import abi from 'ethereumjs-abi'
import Aragon, { ensResolve } from '@aragon/wrapper'
import { asyncScheduler } from 'rxjs'
import { takeWhile, filter, first, throttleTime } from 'rxjs/operators'
//import SimpleStorageContract from './contracts/SimpleStorage.json'
import PathMapContract from './contracts/PathMap.json'
import getWeb3 from './getWeb3'

import "./App.css";

const encodeActCall = (signature, params) => {
  const sigBytes = web3EthAbiUntyped.encodeFunctionSignature(signature)
  const types = signature.replace(')', '').split('(')[1]

  // No params, return signature directly
  if(types === '') return sigBytes

  const paramBytes = web3EthAbiUntyped.encodeParameters(types.split(','), params)
  return `${sigBytes}${paramBytes.slice(2)}`
}

const createExecutorId = id => `0x${String(id).padStart(8, '0')}`

const encodeCallScript = (actions, specId = 1) => (
  actions.reduce(
    (script, { to, calldata }) => {
      const addr = abi.rawEncode(['address'], [to]).toString('hex')
      const length = abi.rawEncode(['uint256'], [(calldata.length - 2) / 2]).toString('hex')

      // Remove 12 first 0s of padding for addr and 28 0s for uint32
      return script + addr.slice(24) + length.slice(56) + calldata.slice(2)
    },
    createExecutorId(specId)
  )
)

// https://github.com/aragon/aragon-cli/blob/master/packages/toolkit/src/node/misc.js
const noop = () => {}

// https://github.com/aragon/aragon-cli/blob/master/packages/toolkit/src/util.js
const addressesEqual = (first, second) => {
  first = first && first.toLowerCase()
  second = second && second.toLowerCase()
  return first === second
}

// https://github.com/aragon/aragon-cli/blob/master/packages/toolkit/src/helpers/aragonjs-wrapper.js
const subscribe = (
  wrapper,
  { onApps, onForwarders, onTransaction, onPermissions }
) => {
  const { apps, forwarders, transactions, permissions } = wrapper

  const subscriptions = {
    apps: apps.subscribe(onApps),
    connectedApp: null,
    forwarders: forwarders.subscribe(onForwarders),
    transactions: transactions.subscribe(onTransaction),
    permissions: permissions.subscribe(onPermissions),
  }

  return subscriptions
}

const resolveEnsDomain = async (domain, opts) => {
  try {
    return await ensResolve(domain, opts)
  } catch (err) {
    if (err.message === 'ENS name not defined.') {
      return ''
    }
    throw err
  }
}

const getTransactionPath = async (appAddress, method, params, wrapper) => {
  // Wait for app info to load
  console.log('HH')
  const apps = await wrapper.apps
    .pipe(
      // If the app list contains a single app, wait for more
      filter((apps) => apps.length > 1),
      throttleTime(3000, asyncScheduler, { trailing: true }),
      first()
    )
    .toPromise()

  console.log(apps)

  if(!apps.some((app) => addressesEqual(appAddress, app.proxyAddress))) {
    throw new Error(`Can't find app ${appAddress}.`)
  }

  // If app is the ACL, call getACLTransactionPath
  return appAddress === wrapper.aclProxy.address
    ? wrapper.getACLTransactionPath(method, params)
    : wrapper.getTransactionPath(appAddress, method, params)
}

const initAragonJS = async (
  dao, ensRegistryAddress,
  {
    provider, gasPrice, accounts = '', ipfsConf = {},
    onApps = noop, onForwarders = noop, onTransaction = noop,
    onDaoAddress = noop, onPermissions = noop,
  } = {}
) => {
  const isDomain = (dao) => /[a-z0-9]+\.eth/.test(dao)

  const daoAddress = isDomain(dao)
    ? await resolveEnsDomain(dao, {
        provider,
        registryAddress: ensRegistryAddress,
      })
    : dao

  if(!daoAddress) {
    throw new Error('The provided DAO address is invalid')
  }

  console.log('DAO', daoAddress)

  onDaoAddress(daoAddress)

  // TODO: don't reinitialize if cached
  const wrapper = new Aragon(daoAddress, {
    provider,
    defaultGasPriceFn: () => gasPrice,
    apm: {
      ipfs: ipfsConf,
      ensRegistryAddress,
    },
  })

  try {
    await wrapper.init({ accounts: { providedAccounts: accounts } })
  } catch (err) {
    if (err.message === 'connection not open') {
      throw new Error('The wrapper cannot be initialized without a connection')
    }
    throw err
  }

  const subscriptions = subscribe(
    wrapper,
    { onApps, onForwarders, onTransaction, onPermissions },
    { ipfsConf }
  )

  wrapper.cancel = () => {
    Object.values(subscriptions).forEach((subscription) => {
      if (subscription) {
        subscription.unsubscribe()
      }
    })
  }

  return wrapper
}

const exec = async function ({
  dao, app, method, params, apm, web3, wsProvider, gasPrice, progressHandler = console.log
}) {
  const wrapper = await initAragonJS(dao,
    apm.ensRegistryAddress, {
    ipfsConf: apm.ipfs,
    gasPrice,
    provider: wsProvider || web3.currentProvider,
    accounts: await web3.eth.getAccounts(),
  })

  progressHandler(1)

  const transactionPath = (
    await getTransactionPath(app, method, params, wrapper)
  )[0]

  if (!transactionPath)
    throw new Error('Cannot find transaction path for executing action')

  progressHandler(2)

  return {
    transactionPath,
    receipt: await web3.eth.sendTransaction(transactionPath),
  }
}

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

      const networkId = await web3.eth.net.getId()
      // const deployedNetwork = SimpleStorageContract.networks[networkId]
      // const abi = SimpleStorageContract.abi
      const deployedNetwork = PathMapContract.networks[networkId]

      if(!deployedNetwork) {
        alert(`Contract address not found for network #${networkId}`)
      }

      const abi = PathMapContract.abi
      const instance = new web3.eth.Contract(
        abi, deployedNetwork && deployedNetwork.address
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
    const { web3, accounts, contract } = state

    console.log(contract)

    const path = '/book/by/Aldous Huxlex/Island/'
    const cid = new CID('QmZb3XL8oT8xRpLJQVzHP76gvPuB7E423CCiXJ61pD6LeS')
    console.log(cid)

    // const tx = await contract.methods.set(path, cid.codec, Array.from(cid.multihash)).send({ from: accounts[0] })
    // console.log(tx)

    // const response = await contract.methods.get(path).call()
    // console.log(response)

    // const result = new CID(1, response.codec, Buffer.from(response.multihash))
    // console.log(result)

    const mapPath = 'mapPath(string,string,uint8[])'
    const calldata = encodeActCall(mapPath, [path, cid.codec, Array.from(cid.multihash)])
    // console.log(calldata)
    // console.log(abi)
    // console.log(contract.options.address)
    const actions = [{ to: contract.options.address, calldata }]
    const script = encodeCallScript(actions)
    // console.log(script)

    const daoAddress = '0x0d053730f22ea05ca901193c5d94a21f7106cfae'
    const votingAddress = '0xdb6c869bbe60131452794e8e278cba01510d23b2'
    const environment = 'rinkeby'
    const ensRegistryAddress = '0xe7410170f87102df0055eb195163a03b7f2bff4a'
    const apm = {
      ipfs: {
        rpc: {
          protocol: 'http',
          host: 'localhost',
          port: 5001,
          default: true,
        },
        gateway: 'http://localhost:8080/ipfs',
      },
      ensRegistryAddress,
    }

    const tx = await exec({
      web3,
      dao: daoAddress,
      app: votingAddress,
      method: 'newVote',
      params: [script, `Update: ${path}`],
      apm: apm,
    })

    // const tx = await exec(
    //   daoAddress,
    //   votingAddress,
    //   'newVote',
    //   [script, `Update: ${path}`],
    //   () => {},
    //   environment
    // )
    //setState({ storageValue: result.toString() })
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