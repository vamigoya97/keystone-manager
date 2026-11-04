// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * KeystonePass — the on-chain keystone an operator issues for one NFC-linked gallery.
 *
 * Gasless for holders: only the owner (the platform's operator wallet)
 * can mint, and it pays the gas. There is no mint price, and nobody can
 * mint around the tap-verified claim flow.
 *
 * Metadata lives on chain and tokenURI() / contractURI() build standard
 * (OpenSea-style) JSON in the contract, so no server is needed to display a
 * keystone: name, description, image (ipfs://<cid>, content-addressed so the
 * artwork can't silently change), external_url, background_color,
 * animation_url, attributes and an optional
 * inscription. The operator can edit the metadata until it is frozen;
 * freezing is permanent.
 *
 * Transfers can be switched off (soulbound, ERC-5192): keystones then stay in
 * the wallet they were minted to. Minting and operator burns still work.
 * The operator can toggle this until the rule is frozen; every change emits
 * ERC-5192 Locked / Unlocked for each existing keystone, so indexers that
 * follow those events stay in sync.
 */
contract KeystonePass is ERC721, Ownable {
    using Strings for uint256;

    uint256 private _nextId = 1;
    uint256 public totalSupply;

    struct Metadata {
        string description;
        /// Usually ipfs://<cid> of the keystone artwork.
        string image;
        /// Free-form text committed on chain (story, terms, dedication…).
        string inscription;
        /// The keystone's page, e.g. https://<app>/x/<slug>.
        string externalUrl;
        /// Optional looping video, usually ipfs://<cid>.
        string animationUrl;
        /// Six hex digits without "#", e.g. "C26C6B".
        string backgroundColor;
        /// Comma-separated JSON attribute objects, without the surrounding [ ].
        /// Built by the platform and returned as-is.
        string attributes;
    }

    Metadata public metadata;
    bool public metadataFrozen;

    /// When false, wallet-to-wallet transfers revert (soulbound).
    bool public transferable;
    /// Once true, `transferable` can never change again.
    bool public transferRuleFrozen;

    event MetadataUpdated(Metadata metadata);
    event MetadataFrozen();
    /// ERC-4906: tells marketplaces to refresh every token's metadata.
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);
    /// ERC-5192: emitted per token at mint while keystones are soulbound, and for
    /// every existing token when transfers are switched off.
    event Locked(uint256 tokenId);
    /// ERC-5192: emitted for every existing token when transfers are switched on.
    event Unlocked(uint256 tokenId);
    event TransferabilitySet(bool transferable);
    event TransferRuleFrozen();

    error TransfersDisabled();

    constructor(
        string memory name_,
        string memory symbol_,
        Metadata memory metadata_,
        bool freeze_,
        bool transferable_,
        address operator
    ) ERC721(name_, symbol_) Ownable(operator) {
        metadata = metadata_;
        transferable = transferable_;
        emit MetadataUpdated(metadata_);
        emit TransferabilitySet(transferable_);
        if (freeze_) {
            metadataFrozen = true;
            emit MetadataFrozen();
        }
    }

    // ── Membership ───────────────────────────────────────────────

    function mint(address to) external onlyOwner returns (uint256 tokenId) {
        tokenId = _nextId++;
        totalSupply++;
        _safeMint(to, tokenId);
        if (!transferable) emit Locked(tokenId);
    }

    function burn(uint256 tokenId) external onlyOwner {
        totalSupply--;
        _burn(tokenId);
    }

    // ── Transferability ──────────────────────────────────────────

    /// Switches transfers on or off for every keystone. Gas grows with the number of
    /// keystones minted, since each one gets its ERC-5192 Locked / Unlocked event.
    function setTransferable(bool transferable_) external onlyOwner {
        require(!transferRuleFrozen, "Transfer rule frozen");
        if (transferable_ == transferable) return;
        transferable = transferable_;
        emit TransferabilitySet(transferable_);
        uint256 last = _nextId;
        for (uint256 id = 1; id < last; id++) {
            if (_ownerOf(id) == address(0)) continue; // burned
            if (transferable_) emit Unlocked(id);
            else emit Locked(id);
        }
    }

    /// Permanently fixes the current transfer rule.
    function freezeTransferRule() external onlyOwner {
        require(!transferRuleFrozen, "Already frozen");
        transferRuleFrozen = true;
        emit TransferRuleFrozen();
    }

    /// ERC-5192: true when the keystone can't be transferred.
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return !transferable;
    }

    /// Blocks wallet-to-wallet moves while soulbound; mint (from 0) and burn (to 0) always pass.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        if (!transferable && from != address(0) && to != address(0)) revert TransfersDisabled();
        return super._update(to, tokenId, auth);
    }

    // ── Metadata ─────────────────────────────────────────────────

    function setMetadata(Metadata calldata metadata_) external onlyOwner {
        require(!metadataFrozen, "Metadata frozen");
        metadata = metadata_;
        emit MetadataUpdated(metadata_);
        emit BatchMetadataUpdate(1, type(uint256).max);
    }

    /// Permanently locks all metadata (description, image, links, attributes, inscription).
    function freezeMetadata() external onlyOwner {
        require(!metadataFrozen, "Already frozen");
        metadataFrozen = true;
        emit MetadataFrozen();
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Metadata storage m = metadata;
        string memory json = string.concat(
            '{"name":"', _escape(string.concat(name(), " #", tokenId.toString())),
            '","description":"', _escape(m.description),
            '","image":"', _escape(m.image), '"',
            _field("external_url", m.externalUrl),
            _field("background_color", m.backgroundColor),
            _field("animation_url", m.animationUrl),
            ',"attributes":[', m.attributes, "]",
            _field("inscription", m.inscription),
            "}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// Collection-level metadata (ERC-7572), read by marketplaces.
    function contractURI() external view returns (string memory) {
        Metadata storage m = metadata;
        string memory json = string.concat(
            '{"name":"', _escape(name()),
            '","description":"', _escape(m.description),
            '","image":"', _escape(m.image), '"',
            _field("external_link", m.externalUrl),
            "}"
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return
            interfaceId == bytes4(0x49064906) || // ERC-4906
            interfaceId == bytes4(0xb45a3c0e) || // ERC-5192
            super.supportsInterface(interfaceId);
    }

    /// `,"key":"value"`, or nothing when value is empty.
    function _field(string memory key, string memory value) internal pure returns (string memory) {
        return bytes(value).length > 0 ? string.concat(',"', key, '":"', _escape(value), '"') : "";
    }

    /// JSON-escapes quotes, backslashes and common whitespace controls.
    function _escape(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        uint256 extra;
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            if (c == '"' || c == "\\" || c == 0x0a || c == 0x0d || c == 0x09) extra++;
        }
        if (extra == 0) return s;

        bytes memory out = new bytes(b.length + extra);
        uint256 j;
        for (uint256 i; i < b.length; i++) {
            bytes1 c = b[i];
            if (c == '"' || c == "\\") {
                out[j++] = "\\";
                out[j++] = c;
            } else if (c == 0x0a) {
                out[j++] = "\\";
                out[j++] = "n";
            } else if (c == 0x0d) {
                out[j++] = "\\";
                out[j++] = "r";
            } else if (c == 0x09) {
                out[j++] = "\\";
                out[j++] = "t";
            } else {
                out[j++] = c;
            }
        }
        return string(out);
    }
}
