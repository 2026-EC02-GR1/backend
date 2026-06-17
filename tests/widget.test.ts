import { describe, expect, test } from "bun:test";
import { DomainError } from "../src/domain/errors";
import {
	buildWidgetSnippet,
	DEFAULT_WIDGET_CDN_URL,
} from "../src/domain/widget";

const PROPERTY_ID = "0d4eaa8c-5fbe-4e23-9b6f-2f5c2a1d7e90";

describe("buildWidgetSnippet", () => {
	test("embeds the CDN bundle with the property id as data-property (spec)", () => {
		const snippet = buildWidgetSnippet(PROPERTY_ID);
		expect(snippet).toBe(
			`<script src="${DEFAULT_WIDGET_CDN_URL}/widget.js" data-property="${PROPERTY_ID}" async></script>`,
		);
	});

	test("accepts a custom CDN base URL and strips trailing slashes", () => {
		const snippet = buildWidgetSnippet(PROPERTY_ID, "https://cdn.example.com/");
		expect(snippet).toContain('src="https://cdn.example.com/widget.js"');
	});

	test("rejects a non-UUID property id (prevents attribute injection)", () => {
		expect(() => buildWidgetSnippet('x" onload="alert(1)')).toThrow(
			DomainError,
		);
		expect(() => buildWidgetSnippet("not-a-uuid")).toThrow(/must be a UUID/);
	});
});
