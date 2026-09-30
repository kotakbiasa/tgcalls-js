# Plugins, Scheduling, and Sync Usage

## Smart Plugins

Smart Plugins can reduce boilerplate. Use them to organize reusable client behavior, not to hide unsafe global state.

## Sync wrappers

Sync wrappers exist for cases where async is impractical. Use them carefully and document where blocking may occur.

## Scheduling

If you need scheduled tasks:
- make them cancelable
- make them observable
- avoid hidden background loops

## General guidance

These tools are helpers, not replacements for clear architecture.
