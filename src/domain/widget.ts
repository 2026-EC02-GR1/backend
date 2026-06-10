/**
 * Widget — embed snippet generation (GET /properties/{id}/widget/snippet).
 * The snippet loads the widget JS bundle from the CDN with the property id
 * pre-filled as a `data-property` attribute (spec).
 */
import { DomainError } from "./errors";

const UUID =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEFAULT_WIDGET_CDN_URL = "https://cdn.resa.com";

export function buildWidgetSnippet(
	propertyId: string,
	cdnBaseUrl: string = DEFAULT_WIDGET_CDN_URL,
): string {
	if (!UUID.test(propertyId)) {
		throw new DomainError("invalid_property_id", "property_id must be a UUID");
	}
	const base = cdnBaseUrl.replace(/\/+$/, "");
	return `<script src="${base}/widget.js" data-property="${propertyId}" async></script>`;
}
