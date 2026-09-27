import { catalogModel, pageCost, presetById, SETUP_RECIPES, SetupRecipe } from "@/lib/aiCatalog";
import { AiSettings } from "@/types";
import { Check } from "lucide-react";
import React from "react";
import { cn } from "../../utils/cn";
import { Button, Chip, Mono } from "../ui";
import { formatPageCost } from "./format";

const presetsOf = (recipe: SetupRecipe) => [
  ...new Set(
    [recipe.reader, recipe.translator, recipe.readerFallback, recipe.translatorFallback]
      .filter(Boolean)
      .map((stage) => stage![0]),
  ),
];

/** Paid cost of one page on the recipe's main models. */
const recipeCost = (recipe: SetupRecipe) => {
  const reader = catalogModel(recipe.reader[1]);
  const translator = catalogModel(recipe.translator[1]);
  const read = reader ? pageCost(reader, "reading") : undefined;
  const translate = translator ? pageCost(translator, "translation") : undefined;
  return read === undefined || translate === undefined ? undefined : read + translate;
};

const matches = (ai: AiSettings, recipe: SetupRecipe) => {
  const presetOf = (providerId?: string) => ai.providers.find((provider) => provider.id === providerId)?.preset;
  const same = (choice: AiSettings["reader"] | undefined, stage?: [string, string]) =>
    stage ? !!choice && presetOf(choice.providerId) === stage[0] && choice.model === stage[1] : !choice;
  return (
    same(ai.reader, recipe.reader) &&
    same(ai.translator, recipe.translator) &&
    same(ai.readerFallback, recipe.readerFallback) &&
    same(ai.translatorFallback, recipe.translatorFallback)
  );
};

/** Ready-made setups: one click picks sensible models for every stage. */
const SetupRecipes: React.FC<{ ai: AiSettings; onApply: (recipe: SetupRecipe) => void }> = ({ ai, onApply }) => (
  <div className="grid gap-2 sm:grid-cols-2">
    {SETUP_RECIPES.map((recipe) => {
      const current = matches(ai, recipe);
      const cost = recipeCost(recipe);
      const presets = presetsOf(recipe);
      const missing = presets.filter(
        (preset) =>
          !ai.providers.some(
            (provider) =>
              provider.preset === preset && (provider.apiKeys.length > 0 || provider.id === "system-gemini"),
          ),
      );
      return (
        <div
          key={recipe.id}
          className={cn(
            "flex flex-col gap-2 rounded-panel border p-3",
            current ? "border-action bg-npb" : "border-line bg-page",
          )}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">{recipe.label}</span>
            <Chip size="sm" tone={recipe.free ? "ok" : "neutral"} className="ml-auto">
              {recipe.free ? "Free" : cost !== undefined ? `≈ ${formatPageCost(cost)}/page` : "Paid"}
            </Chip>
          </div>
          <p className="text-xs leading-relaxed text-ink-2">{recipe.summary}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
            <dt className="text-ink-3">Reads</dt>
            <dd className="truncate text-ink-2">{catalogModel(recipe.reader[1])?.label || recipe.reader[1]}</dd>
            <dt className="text-ink-3">Translates</dt>
            <dd className="truncate text-ink-2">{catalogModel(recipe.translator[1])?.label || recipe.translator[1]}</dd>
            {recipe.readerFallback && (
              <>
                <dt className="text-ink-3">Backup</dt>
                <dd className="truncate text-ink-2">
                  {catalogModel(recipe.readerFallback[1])?.label || recipe.readerFallback[1]}
                </dd>
              </>
            )}
          </dl>
          <div className="mt-auto flex items-center gap-2 pt-1">
            {missing.length > 0 ? (
              <span className="text-xs text-ink-3">
                Needs a key for{" "}
                <Mono className="text-ink-2">
                  {missing.map((preset) => presetById(preset)?.label || preset).join(", ")}
                </Mono>
              </span>
            ) : (
              <span className="text-xs text-ok">Keys ready</span>
            )}
            <Button
              size="sm"
              variant={current ? "ghost" : "secondary"}
              icon={current ? <Check /> : undefined}
              disabled={current}
              onClick={() => onApply(recipe)}
              className="ml-auto"
            >
              {current ? "In use" : "Use this"}
            </Button>
          </div>
        </div>
      );
    })}
  </div>
);

export default SetupRecipes;
