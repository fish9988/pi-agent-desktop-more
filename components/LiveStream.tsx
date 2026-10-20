"use client";

import { memo, useLayoutEffect, useMemo, type ComponentProps } from "react";
import type { AgentMessage, AssistantMessage, ToolResultMessage } from "@/lib/types";
import { INITIAL_STREAMING_STATE, type StreamingState, type StreamingStore } from "@/lib/streaming-message";
import { countToolCallBlocks, splitFinalAssistantBlocks } from "@/lib/message-display";
import { currentWorkActivity } from "@/lib/work-details";
import { useStreamingSelector } from "@/hooks/useStreamingSelector";
import { useArtifactPublisher } from "@/hooks/useArtifactPublisher";
import { MessageView } from "./MessageView";
import { LiveWorkGroup } from "./WorkGroups";

/**
 * Plus port of pi-web #1191 for this fork's chat: the reply being streamed
 * lives in a StreamingStore, and only the pieces below subscribe to its
 * chunks. ChatWindow itself reads just the stream's shape, which changes a
 * few times per reply, not on every chunk.
 */

export interface LiveSplit {
  /** The whole streaming message, while a reply streams. */
  whole: AssistantMessage | null;
  /** Its reasoning and tool calls, while live work is grouped. */
  process: AssistantMessage | null;
  /** Its trailing answer text, while live work is grouped. */
  answer: AssistantMessage | null;
}

const EMPTY_SPLIT: LiveSplit = { whole: null, process: null, answer: null };

export function streamingAssistant(state: StreamingState): AssistantMessage | null {
  const message = state.isStreaming ? state.streamingMessage : null;
  return message && message.role === "assistant" ? message as AssistantMessage : null;
}

export function splitLiveMessage(message: AssistantMessage | null, groupLiveWork: boolean): LiveSplit {
  if (!message) return EMPTY_SPLIT;
  if (!groupLiveWork) return { whole: message, process: null, answer: null };
  const { processBlocks, answerBlocks } = splitFinalAssistantBlocks(message, { isStreaming: true });
  if (processBlocks.length === 0) return { whole: message, process: null, answer: null };
  return {
    whole: message,
    process: { ...message, content: processBlocks },
    answer: answerBlocks.length > 0 ? { ...message, content: answerBlocks } : null,
  };
}

/** "process|answer|toolCalls" — what ChatWindow lays out around the stream. */
export function liveStreamShape(state: StreamingState, groupLiveWork: boolean): string {
  const split = splitLiveMessage(streamingAssistant(state), groupLiveWork);
  return `${split.process ? 1 : 0}|${split.answer ? 1 : 0}|${split.process ? countToolCallBlocks(split.process.content) : 0}`;
}

export function parseLiveStreamShape(shape: string): { hasProcess: boolean; hasAnswer: boolean; processToolCalls: number } {
  const [process, answer, tools] = shape.split("|");
  return { hasProcess: process === "1", hasAnswer: answer === "1", processToolCalls: Number(tools) || 0 };
}

const selectStreamingAssistant = (state: StreamingState) => streamingAssistant(state);

/** The live split, re-rendering the caller on every chunk. */
export function useLiveSplit(store: StreamingStore | undefined, groupLiveWork: boolean): LiveSplit {
  const message = useStreamingSelector(store ?? NULL_STORE, selectStreamingAssistant);
  return useMemo(() => splitLiveMessage(store ? message : null, groupLiveWork), [store, message, groupLiveWork]);
}

const NULL_STORE: StreamingStore = {
  getState: () => INITIAL_STREAMING_STATE,
  dispatch: () => {},
  subscribe: () => () => {},
};

type MessageViewProps = ComponentProps<typeof MessageView>;

/** The reply streaming below the turn: its answer part, or all of it. */
export const StreamingReply = memo(function StreamingReply({ store, groupLiveWork, onCommit, ...props }: {
  store: StreamingStore;
  groupLiveWork: boolean;
  onCommit: () => void;
} & Omit<MessageViewProps, "message" | "isStreaming">) {
  const split = useLiveSplit(store, groupLiveWork);
  const message = split.process ? split.answer : split.whole;
  useLayoutEffect(onCommit, [message, onCommit]);
  if (!message || !message.content.length) return null;
  return <MessageView message={message as AgentMessage} isStreaming {...props} />;
});

/** The streaming reasoning/tool calls inside the live work group (card levels). */
export const StreamingProcess = memo(function StreamingProcess({ store, onCommit, ...props }: {
  store: StreamingStore;
  onCommit: () => void;
} & Omit<MessageViewProps, "message" | "isStreaming">) {
  const { process } = useLiveSplit(store, true);
  useLayoutEffect(onCommit, [process, onCommit]);
  if (!process) return null;
  return <MessageView message={process as AgentMessage} isStreaming {...props} />;
});

/** The live work row, whose label follows the stream (what is being run or thought). */
export const StreamingLiveWorkGroup = memo(function StreamingLiveWorkGroup({ store, turnMessages, toolResults, ...props }: {
  store: StreamingStore;
  turnMessages: readonly AgentMessage[];
  toolResults: ReadonlyMap<string, ToolResultMessage>;
} & Omit<ComponentProps<typeof LiveWorkGroup>, "activity">) {
  const { process } = useLiveSplit(store, true);
  const activity = useMemo(() => currentWorkActivity(turnMessages, process, toolResults), [turnMessages, process, toolResults]);
  return <LiveWorkGroup activity={activity} {...props} />;
});

/** Publishes artifacts from the transcript and the reply still streaming. */
export function StreamingArtifactPublisher({ store, sessionId, messages, send }: {
  store: StreamingStore;
  sessionId: string | null | undefined;
  messages: readonly AgentMessage[];
  send: (text: string) => void;
}) {
  const streaming = useStreamingSelector(store, selectStreamingAssistant);
  useArtifactPublisher(sessionId, messages, streaming, send);
  return null;
}
