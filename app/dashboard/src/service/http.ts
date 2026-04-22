import { FetchOptions, $fetch as ohMyFetch } from "ofetch";
import { getAuthToken } from "utils/authStorage";

const normalizeBaseApi = (rawBaseApi?: string) => {
  const fallback = "/api";
  const value = (rawBaseApi || fallback).trim();
  if (!value) return fallback;
  const normalized = value.replace(/\/+$/, "");
  return normalized || fallback;
};

export const BASE_API_URL = normalizeBaseApi(import.meta.env.VITE_BASE_API);

export const $fetch = ohMyFetch.create({
  baseURL: BASE_API_URL,
});

export const fetcher = <T = any>(
  url: string,
  ops: FetchOptions<"json"> = {}
) => {
  const token = getAuthToken();
  if (token) {
    ops["headers"] = {
      ...(ops?.headers || {}),
      Authorization: `Bearer ${getAuthToken()}`,
    };
  }
  return $fetch<T>(url, ops);
};

export const fetch = fetcher;
