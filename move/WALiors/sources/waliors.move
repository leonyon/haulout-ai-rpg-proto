// Copyright (c) PC Wern

module waliors::waliors {
    // === Imports ===
    use std::string::{utf8, String};
    use sui::display::{Self, Display};
    use sui::transfer::{public_transfer};
    use sui::package::{Publisher, from_package};

    // === Errors ===
    const EInvalidPublisher: u64 = 0;

    // === Constants ===

    // === Structs ===
    public struct WALIORS has drop {}

    public struct WALior has key, store {
        id: UID,
        name: String,
        identity_blob_id: ID
    }

    public struct WALIORMintAuth has key, store {
        id: UID,
        mint_count: u64
    }

    // === Events ===
    public struct WALiorMintedEvent has key, store {
        id: UID,
        name: String,
        identity_blob_id: ID,
        timestamp: u64
    }

    // === Method Aliases ===

    // === Public Functions ===
     
    // === View Functions ===

    // === Admin Functions ===
    fun init(otw: WALIORS, ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        let publisher = sui::package::claim(otw, ctx);

        let keys = vector[
            utf8(b"name"),
            utf8(b"image_url"),
            utf8(b"description"),
            utf8(b"creator")
        ];

        let values = vector[
            utf8(b"WALior: {name}"),
            utf8(b"https://apilink.com/waliorimg/"),
            utf8(b"Avatar in the WALiors game prototype for the Haulout hackathon."),
            utf8(b"@leonyon.sui")
        ];

        let mut walior_display = display::new_with_fields<WALior>(&publisher, keys, values, ctx);
        display::update_version(&mut walior_display);
        transfer::public_transfer(walior_display, sender);

        // ----- Minting Authority -----
        let mint_auth = WALIORMintAuth {
            id: object::new(ctx),
            mint_count: 0
        };

        transfer::public_transfer(mint_auth, sender);
        transfer::public_transfer(publisher, sender)
    }

    public fun mint_to_address(
        auth: &mut WALIORMintAuth,
        name: String,
        identity_blob_id: ID,
        receiver: address,
        ctx: &mut TxContext
    ) {
        let walior = WALior {
            id: object::new(ctx),
            name: name,
            identity_blob_id: identity_blob_id
        };

        auth.mint_count = auth.mint_count + 1;

        public_transfer(walior, receiver);
    }

    public fun mutate_display(
        publisher: &Publisher,
        key: String,
        value: String,
        display: &mut Display<WALior>
    ) {
        assert!(from_package<WALior>(publisher), EInvalidPublisher);
        display::edit<WALior>(display, key, value);
        display::update_version(display);
    }

    // === Package Functions ===

    // === Private Functions ===

    // === Test Functions ===
    #[test_only]
    public fun test_init(ctx: &mut TxContext) {
        init(WALIORS {}, ctx);
    }
}