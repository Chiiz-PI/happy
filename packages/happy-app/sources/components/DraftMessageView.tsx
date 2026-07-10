import * as React from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useSessionDraft } from '@/sync/storage';
import { MarkdownView } from './markdown/MarkdownView';
import { layout } from './layout';

/**
 * Transient typewriter preview of the agent's in-progress reply.
 *
 * Rendered at the visual bottom of the chat list while ephemeral
 * message-draft events stream in; it disappears once the final message
 * lands (or the draft is cleared) so the persisted message takes its place
 * seamlessly. Thinking drafts render dimmed and italic, mirroring how
 * finalized thinking messages look.
 */
export const DraftMessageView = React.memo((props: { sessionId: string }) => {
    const draft = useSessionDraft(props.sessionId);
    if (!draft || !draft.text.trim()) {
        return null;
    }
    const trimmed = draft.text.trim();
    const markdown = draft.thinking ? `*${trimmed}*` : trimmed;
    return (
        <View style={styles.row}>
            <View style={styles.content}>
                <View style={[styles.bubble, draft.thinking && styles.thinking]}>
                    <MarkdownView markdown={markdown} sessionId={props.sessionId} />
                </View>
            </View>
        </View>
    );
});

const styles = StyleSheet.create(() => ({
    row: {
        flexDirection: 'row',
        justifyContent: 'center',
    },
    content: {
        flexDirection: 'column',
        flexGrow: 1,
        flexBasis: 0,
        minWidth: 0,
        maxWidth: layout.maxWidth,
        overflow: 'hidden',
    },
    bubble: {
        marginHorizontal: 16,
        marginBottom: 12,
        maxWidth: '100%',
    },
    thinking: {
        opacity: 0.7,
    },
}));
