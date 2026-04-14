// +build ignore

// Generates cross-SDK golden vectors by signing known payloads with the Go SDK.
// Run: cd test/fixtures && go run generate_vectors.go
//
// The output is a JSON file consumed by test/signer/cross-sdk-vectors.test.ts
// to verify byte-for-byte equivalence between the Go and TS signing pipelines.
package main

import (
	"crypto/ecdsa"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/shopspring/decimal"

	"github.com/sodex-tech/sodex-go-sdk-public/common/enums"
	csigner "github.com/sodex-tech/sodex-go-sdk-public/common/signer"
	ctypes "github.com/sodex-tech/sodex-go-sdk-public/common/types"
	ptypes "github.com/sodex-tech/sodex-go-sdk-public/perps/types"
	stypes "github.com/sodex-tech/sodex-go-sdk-public/spot/types"
)

const testPrivKeyHex = "0123456789012345678901234567890123456789012345678901234567890123"
const chainID = uint64(286623)

type Vector struct {
	Name        string `json:"name"`
	Domain      string `json:"domain"`
	ActionName  string `json:"actionName"`
	PayloadJSON string `json:"payloadJSON"`
	PayloadHash string `json:"payloadHash"`
	DomainSep   string `json:"domainSeparator"`
	Nonce       uint64 `json:"nonce"`
	Digest      string `json:"digest"`
	Signature   string `json:"signature"`
	SignerAddr  string `json:"signerAddress"`
}

func main() {
	key, err := crypto.HexToECDSA(testPrivKeyHex)
	if err != nil {
		panic(err)
	}
	addr := crypto.PubkeyToAddress(key.PublicKey)

	vectors := []Vector{
		genSpotScheduleCancel(key, addr.Hex()),
		genSpotBatchNewOrder(key, addr.Hex()),
		genSpotBatchCancel(key, addr.Hex()),
		genSpotTransferAsset(key, addr.Hex()),
		genSpotReplace(key, addr.Hex()),
		genPerpsNewOrder(key, addr.Hex()),
		genPerpsUpdateLeverage(key, addr.Hex()),
		genPerpsUpdateMargin(key, addr.Hex()),
	}

	bz, _ := json.MarshalIndent(vectors, "", "  ")
	err = os.WriteFile("golden_vectors.json", bz, 0644)
	if err != nil {
		panic(err)
	}
	fmt.Printf("wrote %d vectors to golden_vectors.json\n", len(vectors))
}

func decPtr(s string) *decimal.Decimal {
	d := decimal.RequireFromString(s)
	return &d
}

func signAndCapture(params ctypes.ActionPayloadParams, nonce uint64, domain *ctypes.EIP712Domain, signer *csigner.EVMSigner, key *ecdsa.PrivateKey) (payloadJSON, payloadHash, domainSep, digest, signature string) {
	ap := &ctypes.ActionPayload{Type: params.ActionName(), Params: params}
	bz, _ := json.Marshal(ap)
	payloadJSON = string(bz)

	ph, _ := ap.Hash()
	payloadHash = hex.EncodeToString(ph.Bytes())

	ds := domain.DomainSeparator()
	domainSep = hex.EncodeToString(ds.Bytes())

	ea := &ctypes.ExchangeAction{PayloadHash: ph, Nonce: nonce}
	d := ea.Hash(domain)
	digest = hex.EncodeToString(d.Bytes())

	sig, _ := signer.SignAction(params, nonce, key)
	signature = hex.EncodeToString(sig)

	return
}

func genSpotScheduleCancel(key *ecdsa.PrivateKey, addr string) Vector {
	domain := ctypes.NewEIP712Domain(ctypes.SpotDomainName, chainID)
	s := csigner.NewEVMSigner(&domain)
	req := &ctypes.ScheduleCancelRequest{AccountID: 1001}
	pj, ph, ds, d, sig := signAndCapture(req, 1, &domain, s, key)
	return Vector{"spot_scheduleCancel", "spot", req.ActionName(), pj, ph, ds, 1, d, sig, addr}
}

func genSpotBatchNewOrder(key *ecdsa.PrivateKey, addr string) Vector {
	domain := ctypes.NewEIP712Domain(ctypes.SpotDomainName, chainID)
	s := csigner.NewEVMSigner(&domain)
	req := &stypes.BatchNewOrderRequest{
		AccountID: 1001,
		Orders: []*stypes.BatchNewOrderItem{{
			SymbolID: 42, ClOrdID: "order-001",
			Side: enums.OrderSideBuy, Type: enums.OrderTypeLimit,
			TimeInForce: enums.TimeInForceGTC,
			Price: decPtr("50000"), Quantity: decPtr("0.1"),
		}},
	}
	pj, ph, ds, d, sig := signAndCapture(req, 100, &domain, s, key)
	return Vector{"spot_batchNewOrder", "spot", req.ActionName(), pj, ph, ds, 100, d, sig, addr}
}

func genSpotBatchCancel(key *ecdsa.PrivateKey, addr string) Vector {
	domain := ctypes.NewEIP712Domain(ctypes.SpotDomainName, chainID)
	s := csigner.NewEVMSigner(&domain)
	req := &stypes.BatchCancelOrderRequest{
		AccountID: 1001,
		Cancels: []*stypes.BatchCancelOrderItem{{
			SymbolID: 42, ClOrdID: "cancel-001",
		}},
	}
	pj, ph, ds, d, sig := signAndCapture(req, 200, &domain, s, key)
	return Vector{"spot_batchCancelOrder", "spot", req.ActionName(), pj, ph, ds, 200, d, sig, addr}
}

func genSpotTransferAsset(key *ecdsa.PrivateKey, addr string) Vector {
	domain := ctypes.NewEIP712Domain(ctypes.SpotDomainName, chainID)
	s := csigner.NewEVMSigner(&domain)
	req := &ctypes.TransferAssetRequest{
		ID: 1, FromAccountID: 1001, ToAccountID: 999,
		CoinID: 0, Amount: decimal.RequireFromString("100"),
		Type: enums.TransferAssetTypePerpsWithdraw,
	}
	pj, ph, ds, d, sig := signAndCapture(req, 300, &domain, s, key)
	return Vector{"spot_transferAsset", "spot", req.ActionName(), pj, ph, ds, 300, d, sig, addr}
}

func genSpotReplace(key *ecdsa.PrivateKey, addr string) Vector {
	domain := ctypes.NewEIP712Domain(ctypes.SpotDomainName, chainID)
	s := csigner.NewEVMSigner(&domain)
	req := &ctypes.ReplaceOrderRequest{
		AccountID: 1001,
		Orders: []*ctypes.ReplaceParams{{
			SymbolID: 42, ClOrdID: "replace-001",
			Price: decPtr("50100"), Quantity: decPtr("0.2"),
		}},
	}
	pj, ph, ds, d, sig := signAndCapture(req, 400, &domain, s, key)
	return Vector{"spot_replaceOrder", "spot", req.ActionName(), pj, ph, ds, 400, d, sig, addr}
}

func genPerpsNewOrder(key *ecdsa.PrivateKey, addr string) Vector {
	domain := ctypes.NewEIP712Domain(ctypes.PerpsDomainName, chainID)
	s := csigner.NewEVMSigner(&domain)
	req := &ptypes.NewOrderRequest{
		AccountID: 12345, SymbolID: 1,
		Orders: []*ptypes.RawOrder{{
			ClOrdID: "my-order-1", Modifier: enums.OrderModifierNormal,
			Side: enums.OrderSideBuy, Type: enums.OrderTypeMarket,
			TimeInForce: enums.TimeInForceIOC,
			Quantity: decPtr("0.001"),
			ReduceOnly: false, PositionSide: enums.PositionSideBoth,
		}},
	}
	pj, ph, ds, d, sig := signAndCapture(req, 500, &domain, s, key)
	return Vector{"perps_newOrder", "futures", req.ActionName(), pj, ph, ds, 500, d, sig, addr}
}

func genPerpsUpdateLeverage(key *ecdsa.PrivateKey, addr string) Vector {
	domain := ctypes.NewEIP712Domain(ctypes.PerpsDomainName, chainID)
	s := csigner.NewEVMSigner(&domain)
	req := &ptypes.UpdateLeverageRequest{
		AccountID: 1001, SymbolID: 1, Leverage: 10, MarginMode: enums.MarginModeCross,
	}
	pj, ph, ds, d, sig := signAndCapture(req, 600, &domain, s, key)
	return Vector{"perps_updateLeverage", "futures", req.ActionName(), pj, ph, ds, 600, d, sig, addr}
}

func genPerpsUpdateMargin(key *ecdsa.PrivateKey, addr string) Vector {
	domain := ctypes.NewEIP712Domain(ctypes.PerpsDomainName, chainID)
	s := csigner.NewEVMSigner(&domain)
	req := &ptypes.UpdateMarginRequest{
		AccountID: 1001, SymbolID: 1, Amount: decimal.RequireFromString("-50"),
	}
	pj, ph, ds, d, sig := signAndCapture(req, 700, &domain, s, key)
	return Vector{"perps_updateMargin", "futures", req.ActionName(), pj, ph, ds, 700, d, sig, addr}
}
