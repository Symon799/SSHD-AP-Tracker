import { type PayloadAction, createSlice } from '@reduxjs/toolkit';
import { getStoredCustomization } from '../LocalStorage';
import { type ColorScheme, lightColorScheme } from './ColorScheme';

export type ItemLayout = 'grid' | 'inventory';

export interface CustomizationState {
    colorScheme: ColorScheme;
    itemLayout: ItemLayout;
    debugMode: boolean;
    trickSemilogic: boolean;
    enabledTrickLogicTricks: string[];
    autoRegionLoading: boolean;
}

const initialState: CustomizationState = {
    colorScheme: lightColorScheme,
    itemLayout: 'grid',
    debugMode: false,
    trickSemilogic: false,
    enabledTrickLogicTricks: [],
    autoRegionLoading: true,
};

export function preloadedCustomizationState(): CustomizationState {
    const loadedState = getStoredCustomization();

    return {
        ...initialState,
        ...loadedState,
        debugMode: false,
        colorScheme: { ...lightColorScheme, ...loadedState.colorScheme },
    };
}

const customizationSlice = createSlice({
    name: 'customization',
    initialState,
    reducers: {
        setColorScheme: (state, action: PayloadAction<ColorScheme>) => {
            state.colorScheme = action.payload;
        },
        setItemLayout: (state, action: PayloadAction<ItemLayout>) => {
            state.itemLayout = action.payload;
        },
        setDebugMode: (state, action: PayloadAction<boolean>) => {
            state.debugMode = action.payload;
        },
        setTrickSemiLogic: (state, action: PayloadAction<boolean>) => {
            state.trickSemilogic = action.payload;
        },
        setEnabledSemilogicTricks: (state, action: PayloadAction<string[]>) => {
            state.enabledTrickLogicTricks = action.payload;
        },
        setAutoRegionLoading: (state, action: PayloadAction<boolean>) => {
            state.autoRegionLoading = action.payload;
        },
        resetCustomizationForTest: (_state, _action: PayloadAction<void>) => {
            return initialState;
        },
    },
});

export const {
    setColorScheme,
    setItemLayout,
    setDebugMode,
    setTrickSemiLogic,
    setEnabledSemilogicTricks,
    setAutoRegionLoading,
    resetCustomizationForTest,
} = customizationSlice.actions;

export default customizationSlice.reducer;
