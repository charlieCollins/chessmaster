// frontend/src/themes.ts
// Board colour themes. They only recolour the board squares; the rest of the app keeps
// one palette (index.css) so every page looks the same whichever board you pick.
import { createContext, useContext } from "react";

export interface BoardTheme {
  name: string;
  dark: string;
  light: string;
}

export const THEMES: BoardTheme[] = [
  { name: "Walnut",     dark: "#b58863", light: "#f0d9b5" },
  { name: "Tournament", dark: "#6f8f58", light: "#eeeed2" },
  { name: "Slate",      dark: "#7189a3", light: "#dee3e6" },
  { name: "Mahogany",   dark: "#8b5e3c", light: "#deba9e" },
  { name: "Night",      dark: "#4b5a7a", light: "#9aa8c4" },
  { name: "Stone",      dark: "#8a8478", light: "#d9d4c7" },
];

export const ThemeContext = createContext<BoardTheme>(THEMES[0]);
export const useBoardTheme = () => useContext(ThemeContext);
