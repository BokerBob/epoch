export type DateSource = "cdate" | "namedate" | "content" | "tracked";

export interface DateEntry {
    date: string;
    file: string;
    blockStart: number;
    blockEnd: number;
    summary: string;
    source: DateSource;
}

export interface FileDateEntry extends DateEntry {}

export interface BlockSnapshot {
    start: number;
    end: number;
    hash: string;
    text: string;
}

export interface FileIndexData {
    cdate: FileDateEntry | null;
    namedDate: FileDateEntry | null;
    contentDates: FileDateEntry[];
    trackedDates: Record<string, FileDateEntry[]>;
    blockSnapshot: BlockSnapshot[];
}

export interface StoredFileIndexData extends FileIndexData {
    mdate?: FileDateEntry | null;
}

export interface SerializedEpochIndex {
    files: Record<string, StoredFileIndexData>;
    dates: EpochIndex;
}

export type EpochIndex = Record<string, DateEntry[]>;