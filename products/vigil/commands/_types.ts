// src/commands/_types.ts
import {
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  ButtonInteraction,
  StringSelectMenuInteraction,
  ModalSubmitInteraction,
  Interaction,
} from "discord.js";

/* ───────────────────────── command data ───────────────────────── */
export type CommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

/* ───────────────────── component interactions ──────────────────── */
export type AnyComponentInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

/** More permissive handler signature for component routers (buttons, selects, modals, etc.) */
export type ComponentHandler =
  | ((i: Interaction) => Promise<any> | any)
  | ((i: AnyComponentInteraction) => Promise<any> | any);

/* ────────────────────────── command module ─────────────────────── */
/**
 * CommandModule is kept backward compatible:
 * - `execute` remains (legacy).
 * - `run` is the preferred handler (new router will use this if present).
 * - `defer` can be a boolean or function to indicate whether to defer replies.
 * - `ephemeral` lets a command default its replies to ephemeral when deferring.
 * - `components` map customId prefixes to handlers (longest-prefix wins).
 */
export interface CommandModule {
  data: CommandData;

  /** Preferred handler used by the router. */
  run?: (interaction: ChatInputCommandInteraction) => Promise<any>;

  /** Legacy handler; still supported. If `run` is missing, router will call this. */
  execute?: (interaction: ChatInputCommandInteraction) => Promise<any>;

  /** Autocomplete hook (optional). */
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<any>;

  /**
   * Whether the command should defer immediately.
   * - boolean: static choice
   * - function: dynamic per-interaction decision
   */
  defer?: boolean | ((interaction: ChatInputCommandInteraction) => boolean);

  /** If deferring, whether the initial reply should be ephemeral. */
  ephemeral?: boolean;

  /** Optional component handlers keyed by customId prefix (longest-match wins). */
  components?: Record<string, ComponentHandler>;
}

/* ────────────────────────── helpers (opt) ─────────────────────── */
/** Type guard to normalize a module to a callable handler. */
export function getRunnable(mod: CommandModule) {
  return (mod.run ?? mod.execute) as
    | ((interaction: ChatInputCommandInteraction) => Promise<any>)
    | undefined;
}
