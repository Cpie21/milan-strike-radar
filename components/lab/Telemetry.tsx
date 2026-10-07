'use client';
import { createContext, useContext, type HTMLAttributes } from 'react';
import { useAttention } from './useAttention';

export const SheetTelemetryContext = createContext({ id: 'unknown', open: false });
/** One foreground, in-viewport second; props must contain enums/counts, never copy. */
export function Observed({ event, identity, properties = {}, active = true, children, ...rest }: HTMLAttributes<HTMLDivElement> & {
  event: string; identity: string; properties?: Record<string, unknown>; active?: boolean;
}) {
  const ref = useAttention<HTMLDivElement>(identity, event, properties, active, [1]);
  return <div {...rest} ref={ref}>{children}</div>;
}
export function GuideStep({ step, children }: { step: number; children: React.ReactNode }) {
  const sheet = useContext(SheetTelemetryContext);
  return <Observed event="tool_step_viewed" identity={`${sheet.id}:${step}`} properties={{ tool: sheet.id, step }} active={sheet.open}>{children}</Observed>;
}
