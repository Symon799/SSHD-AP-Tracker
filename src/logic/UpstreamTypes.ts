import type { OptionValue } from '../permalink/SettingsTypes';

export type TimeOfDayInt =
    | /** DayOnly */ 1
    | /** NightOnly */ 2
    | /** Both */ 3;

export interface RawArea {
    name: string;
    abstract: boolean;
    can_sleep: boolean;
    hint_region: string | null;
    allowed_time_of_day: TimeOfDayInt;
    entrances: string[] | undefined;
    exits: Record<string, string> | undefined;
    sub_areas: {
        [subAreaName: string]: RawArea;
    };
    locations: Record<string, string> | undefined;
}

export interface RawEntrance {
    type: 'entrance';
    'can-start-at': boolean | undefined;
    allowed_time_of_day: TimeOfDayInt;
    subtype: string | undefined;
    stage: string | undefined;
    province: string | undefined;
    short_name: string;
}

export interface RawExit {
    type: 'exit';
    allowed_time_of_day: TimeOfDayInt;
    vanilla: string | undefined;
    stage: string | undefined;
    short_name: string;
    'pillar-province': string | undefined;
}

export type RawEntranceShuffleType =
    | 'Spawn'
    | 'Dungeon'
    | 'Trial Gate'
    | 'Gate of Time'
    | 'Door'
    | 'Interior'
    | 'Overworld'
    | 'Bird Statue'
    | 'Faron Region Entrance'
    | 'Eldin Region Entrance'
    | 'Lanayru Region Entrance';

export interface RawEntranceConnection {
    type: RawEntranceShuffleType;
    entrance: string;
    primary: boolean;
    reverse_exit?: string;
    reverse_entrance?: string;
    door_couple_tag?: string;
}

export interface RawCheck {
    type: string | null;
    short_name: string;
    'original item': string;
}

export interface ExitLink {
    exit_from_outside: string | string[];
    exit_from_inside: string;
}

export interface RawLogic {
    items: string[];
    checks: Record<string, RawCheck>;
    /** LocationId -> Area - Location Name */
    gossip_stones: Record<string, string>;
    exits: Record<string, RawExit>;
    entrances: Record<string, RawEntrance>;
    /** SSHD entrance-shuffle metadata, keyed by the source exit id. */
    entrance_connections?: Record<string, RawEntranceConnection>;
    /**
     * Connections that only exist while another SSHD entrance keeps its
     * vanilla destination, keyed by the conditional exit id.
     */
    conditional_vanilla_connections?: Record<string, string>;
    areas: RawArea;
    linked_entrances: {
        silent_realms: {
            [realm: string]: ExitLink;
        };
        dungeons: {
            [dungeon: string]: ExitLink;
        };
    };
    dungeon_completion_requirements: {
        [dungeon: string]: string;
    };
}

export interface RawPresets {
    [presetName: string]: Record<string, OptionValue>;
}
