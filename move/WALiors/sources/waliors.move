// Copyright (c) PC Wern

module waliors::waliors {
    // === Imports ===
    use std::string::{utf8, String};
    use sui::display::{Self, Display};
    use sui::transfer::{public_transfer, share_object};
    use sui::package::{Publisher, from_package};
    use sui::clock::{Clock, timestamp_ms};
    use sui::event::{Self};
    use sui::table::{Self, Table};
    
    // === Errors ===
    const EInvalidPublisher: u64 = 0;
    const ENotAuthorized: u64 = 1;
    const EWaliorNotFound: u64 = 2;

    // === Structs ===
    public struct WALIORS has drop {}

    public struct WALior has key, store {
        id: UID,
        name: String,
        identity_blob_id: String,
        image_blob_id: String,
        generation: u64,
    }

    public struct WALiorAdminAuth has key, store {
        id: UID,
        mint_count: u64
    }

    public struct WALiorRegistry has key {
        id: UID,
        waliors: Table<ID, RegistryEntry>,
        admin_auth: ID 
    }

    public struct RegistryEntry has store, drop {
        walior_id: ID,
        name: String,
        owner: address,
        identity_blob_id: String,
        summary_blob_id: Option<String>,
        last_updated: u64
    }

    // === Events ===
    public struct WALiorMintedEvent has copy, drop {
        id: ID,
        name: String,
        identity_blob_id: String,
        image_blob_id: String,
        owner: address,
        timestamp: u64
    }

    public struct WALiorSummaryUpdatedEvent has copy, drop {
        walior_id: ID,
        summary_blob_id: String,
        timestamp: u64
    }

    // === Init ===
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
            utf8(b"https://aggregator.walrus-testnet.walrus.space/v1/blobs/{image_blob_id}"),
            utf8(b"Avatar in the WALiors game prototype for the Haulout hackathon."),
            utf8(b"@leonyon.sui")
        ];

        let mut walior_display = display::new_with_fields<WALior>(&publisher, keys, values, ctx);
        display::update_version(&mut walior_display);
        transfer::public_transfer(walior_display, sender);

        // ----- Admin Authority -----
        let admin_auth = WALiorAdminAuth {
            id: object::new(ctx),
            mint_count: 0
        };
        let admin_auth_id = object::id(&admin_auth);

        transfer::public_transfer(admin_auth, sender);
        transfer::public_transfer(publisher, sender);

        // ----- Registry -----
        share_object(WALiorRegistry {
            id: object::new(ctx),
            waliors: table::new(ctx),
            admin_auth: admin_auth_id
        });
    }

    public fun admin_auth_to_address(
        publisher: &Publisher,
        receiver: address,
        ctx: &mut TxContext
    ) {
        assert!(from_package<WALior>(publisher), EInvalidPublisher);

        let admin_auth = WALiorAdminAuth {
            id: object::new(ctx),
            mint_count: 0
        };

        transfer::public_transfer(admin_auth, receiver);
    }

    public fun mint_to_address(
        auth: &mut WALiorAdminAuth,
        registry: &mut WALiorRegistry,
        name: String,
        identity_blob_id: String,
        image_blob_id: String,
        receiver: address,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        // Only the auth object passed can mint, implicit check by needing mutable reference
        
        let walior = WALior {
            id: object::new(ctx),
            name: name,
            identity_blob_id: identity_blob_id,
            image_blob_id: image_blob_id,
            generation: 1
        };
        let walior_id = object::id(&walior);

        auth.mint_count = auth.mint_count + 1;

        // Add to Registry
        table::add(&mut registry.waliors, walior_id, RegistryEntry {
            walior_id,
            name: walior.name,
            owner: receiver,
            identity_blob_id: walior.identity_blob_id,
            summary_blob_id: option::none(),
            last_updated: timestamp_ms(clock)
        });

        event::emit(WALiorMintedEvent {
            id: walior_id,
            name: walior.name,
            identity_blob_id: walior.identity_blob_id,
            image_blob_id: walior.image_blob_id,
            owner: receiver,
            timestamp: timestamp_ms(clock)
        });

        public_transfer(walior, receiver);
    }

    public fun update_summary(
        auth: &mut WALiorAdminAuth,
        registry: &mut WALiorRegistry,
        walior_id: ID,
        summary_blob_id: String,
        clock: &Clock,
        _ctx: &mut TxContext
    ) {
        assert!(object::id(auth) == registry.admin_auth, ENotAuthorized);
        assert!(table::contains(&registry.waliors, walior_id), EWaliorNotFound);
        
        let entry = table::borrow_mut(&mut registry.waliors, walior_id);
        entry.summary_blob_id = option::some(summary_blob_id);
        entry.last_updated = timestamp_ms(clock);

        event::emit(WALiorSummaryUpdatedEvent {
            walior_id,
            summary_blob_id,
            timestamp: timestamp_ms(clock)
        });
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
}
