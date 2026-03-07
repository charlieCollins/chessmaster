import { createContext, useContext } from "react";

export interface BoardTheme {
  name: string;
  icon: string;
  // Board squares
  dark: string;
  light: string;
  // Full-app CSS variable overrides (applied to :root)
  vars: Record<string, string>;
}

export const THEMES: BoardTheme[] = [
  {
    name: "Classic", icon: "♟",
    dark: "#B58863", light: "#F0D9B5",
    vars: {
      "--bg":         "#0e0f13",
      "--surface":    "#15171e",
      "--raised":     "#1c1f28",
      "--border":     "#272a35",
      "--border-hi":  "#383c4e",
      "--text":       "#cdd1de",
      "--text-dim":   "#5a5f72",
      "--text-bright":"#eceef5",
      "--gold":       "#c9a84c",
      "--gold-dim":   "#7a6430",
    },
  },
  {
    name: "Forest", icon: "🌲",
    dark: "#5b7a4e", light: "#c8dca0",
    vars: {
      "--bg":         "#0b0f0c",
      "--surface":    "#111a13",
      "--raised":     "#172015",
      "--border":     "#223324",
      "--border-hi":  "#2f4832",
      "--text":       "#c8d8c4",
      "--text-dim":   "#4e6550",
      "--text-bright":"#e4f0e0",
      "--gold":       "#7cad54",
      "--gold-dim":   "#496630",
    },
  },
  {
    name: "Ocean", icon: "🌊",
    dark: "#4a7fa5", light: "#bcd4e6",
    vars: {
      "--bg":         "#0c0f15",
      "--surface":    "#111620",
      "--raised":     "#18202e",
      "--border":     "#243040",
      "--border-hi":  "#354558",
      "--text":       "#c4cede",
      "--text-dim":   "#486070",
      "--text-bright":"#e0eaf5",
      "--gold":       "#5a9fd4",
      "--gold-dim":   "#305870",
    },
  },
  {
    name: "Night", icon: "🌙",
    dark: "#3d4a6b", light: "#8090b0",
    vars: {
      "--bg":         "#0d0d16",
      "--surface":    "#131320",
      "--raised":     "#1a1a2c",
      "--border":     "#26263a",
      "--border-hi":  "#363650",
      "--text":       "#c8c8e0",
      "--text-dim":   "#50506a",
      "--text-bright":"#e4e4f4",
      "--gold":       "#9580d8",
      "--gold-dim":   "#5a4880",
    },
  },
  {
    name: "Autumn", icon: "🍂",
    dark: "#8b5e3c", light: "#deba9e",
    vars: {
      "--bg":         "#130e09",
      "--surface":    "#1c1510",
      "--raised":     "#261c14",
      "--border":     "#3a2a1c",
      "--border-hi":  "#523c28",
      "--text":       "#ddd0c4",
      "--text-dim":   "#6a5040",
      "--text-bright":"#f0e4d8",
      "--gold":       "#d4883a",
      "--gold-dim":   "#7a4e1e",
    },
  },
  {
    name: "Obsidian", icon: "◾",

    dark: "#333344", light: "#667788",
    vars: {
      "--bg":         "#0d0d10",
      "--surface":    "#141418",
      "--raised":     "#1c1c22",
      "--border":     "#28282e",
      "--border-hi":  "#3a3a44",
      "--text":       "#c4c8d4",
      "--text-dim":   "#50545e",
      "--text-bright":"#e0e4ee",
      "--gold":       "#8899bb",
      "--gold-dim":   "#485570",
    },
  },
];

export const ThemeContext = createContext<BoardTheme>(THEMES[0]);
export const useBoardTheme = () => useContext(ThemeContext);
