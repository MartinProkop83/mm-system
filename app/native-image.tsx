import type { ComponentProps } from "react";

type NativeImageProps = Omit<ComponentProps<"img">, "alt"> & { alt: string };

export function NativeImage({ alt, loading = "lazy", decoding = "async", ...props }: NativeImageProps) {
  // Images can come from authenticated routes, object URLs, or R2. Native loading
  // keeps those sources working in the Cloudflare runtime while avoiding eager downloads.
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt} loading={loading} decoding={decoding} {...props} />;
}
