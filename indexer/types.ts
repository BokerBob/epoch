export interface DateEntry {
    date: string;
    file: string;
    blockStart: number;
    blockEnd: number;
    summary: string;
}

export type EpochIndex = Record<string, DateEntry[]>;