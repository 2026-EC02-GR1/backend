# Résa — Database model

> Note: the DB entity `User` is exposed as `Manager` in the API (see `docs/openapi.yaml`).
> `UserRole` is exposed as `ManagerRole`.

```mermaid
classDiagram
  class User {
    +UUID id
    +String name
    +String email
    +String password_hash
    +String phone
    +String two_fa_secret
    +String stripe_account_id
    +Timestamp created_at
    +Timestamp updated_at
    +Timestamp deleted_at
  }

  class Role {
    +UUID id
    +String name
    +String description
    +Timestamp created_at
  }

  class UserRole {
    +UUID id
    +UUID user_id
    +UUID role_id
    +Timestamp assigned_at
  }

  class Property {
    +UUID id
    +UUID user_id
    +String name
    +Text description
    +String address
    +String city
    +String zip_code
    +String country
    +Int max_capacity
    +Int nb_bedrooms
    +Int nb_bathrooms
    +Boolean active
    +Timestamp created_at
    +Timestamp updated_at
    +Timestamp deleted_at
  }

  class PropertyPhoto {
    +UUID id
    +UUID property_id
    +String storage_url
    +Int order
    +Timestamp created_at
  }

  class Rate {
    +UUID id
    +UUID property_id
    +String name
    +Decimal base_price_per_night
    +Date start_date
    +Date end_date
    +Boolean is_high_season
    +Timestamp created_at
    +Timestamp updated_at
  }

  class DiscountRule {
    +UUID id
    +UUID rate_id
    +Int min_nights
    +Int max_nights
    +Decimal discount_percentage
  }

  class BlockedPeriod {
    +UUID id
    +UUID property_id
    +UUID booking_id
    +Date start_date
    +Date end_date
    +Enum source
    +String notes
    +Timestamp created_at
  }

  class HoldSlot {
    +UUID id
    +UUID property_id
    +Date start_date
    +Date end_date
    +String stripe_payment_intent_id
    +Timestamp expires_at
    +Timestamp created_at
  }

  class Booking {
    +UUID id
    +UUID property_id
    +UUID client_id
    +UUID hold_slot_id
    +Date check_in
    +Date check_out
    +Int nb_guests
    +Decimal total_amount
    +Decimal deposit_amount
    +Enum status
    +Enum source
    +String external_reference
    +Timestamp created_at
    +Timestamp updated_at
  }

  class Client {
    +UUID id
    +String last_name
    +String first_name
    +String email
    +String phone
    +Timestamp created_at
    +Timestamp updated_at
    +Timestamp deleted_at
  }

  class Payment {
    +UUID id
    +UUID booking_id
    +String stripe_payment_intent_id
    +Decimal amount
    +Enum type
    +Enum status
    +Timestamp created_at
  }

  class WidgetConfig {
    +UUID id
    +UUID property_id
    +String language
    +Text custom_css
    +Timestamp created_at
    +Timestamp updated_at
  }

  class ICalSync {
    +UUID id
    +UUID property_id
    +String ical_url
    +Enum source
    +Timestamp last_sync_at
    +Enum last_sync_status
    +String error_message
    +Timestamp created_at
  }

  class EventLog {
    +UUID id
    +Enum category
    +String event
    +Enum level
    +UUID actor_id
    +Enum actor_type
    +UUID resource_id
    +String resource_type
    +JSON payload
    +String error_message
    +Timestamp created_at
  }

  User "1" --> "0..*" UserRole : has
  Role "1" --> "0..*" UserRole : assigned via
  User "1" --> "0..*" Property : manages
  Property "1" --> "0..*" PropertyPhoto : has
  Property "1" --> "0..*" Rate : applies
  Rate "1" --> "0..*" DiscountRule : contains
  Property "1" --> "0..*" BlockedPeriod : blocks
  Property "1" --> "0..*" HoldSlot : holds
  Booking "0..1" --> "1" BlockedPeriod : creates
  Property "0..1" --> "0..*" Booking : subject of
  Client "0..1" --> "0..*" Booking : makes
  Booking "1" --> "0..*" Payment : generates
  Property "1" --> "0..1" WidgetConfig : configures
  Property "1" --> "0..*" ICalSync : synchronizes
```

## Deliberate FK exceptions

- `BlockedPeriod.booking_id` has **no FK constraint** — it must survive booking purges.
- `EventLog.actor_id` / `EventLog.resource_id` have **no FK constraints** — logs must survive deletion of any entity.
- `Booking.property_id` and `Booking.client_id` are nullable: set to `NULL` only on permanent purge of the property/client (bookings are kept for history).
