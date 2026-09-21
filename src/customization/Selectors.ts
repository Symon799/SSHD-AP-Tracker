import { createSelector } from '@reduxjs/toolkit';
import { type RootState } from '../store/Store';

export const colorSchemeSelector = (state: RootState) =>
    state.customization.colorScheme;

export const itemLayoutSelector = (state: RootState) =>
    state.customization.itemLayout;

export const debugModeSelector = (state: RootState) =>
    state.customization.debugMode;

export const trickSemiLogicSelector = (state: RootState) =>
    state.customization.trickSemilogic;

export const trickSemiLogicTrickListSelector = createSelector(
    [(state: RootState) => state.customization.enabledTrickLogicTricks],
    (tricks) => new Set(tricks),
);

export const autoRegionLoadingSelector = (state: RootState) =>
    state.customization.autoRegionLoading;
