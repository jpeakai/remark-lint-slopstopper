// Follow Mermaid's declaration ordering and unsetting semantics.
export function propertiesOf(styles: string[]): Record<string, string> {
  const properties: Record<string, string> = {};

  for (const raw of styles.flatMap((style) => style.split(","))) {
    if (!raw.includes(":")) {
      continue;
    }

    const [property = "", value] = raw.split(":");
    const key = property.trim().toLowerCase();

    if (!key) {
      continue;
    }

    if (value?.trim()) {
      properties[key] = value.trim();
    } else {
      delete properties[key];
    }
  }

  return properties;
}
