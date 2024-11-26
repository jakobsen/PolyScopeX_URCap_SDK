import {
    Acceleration,
    AngularAcceleration,
    AngularSpeed,
    Length,
    Speed,
    ProgramNode,
    TabInputModel,
    URVariable,
    Angle,
    Waypoint,
} from '@universal-robots/contribution-api';

export type MoveType = 'moveJ' | 'moveL';
export type WaypointTabInputModel = Omit<Waypoint, 'pose'> & {
    pose: {
        x: TabInputModel<Length>;
        y: TabInputModel<Length>;
        z: TabInputModel<Length>;
        rx: TabInputModel<Angle>;
        ry: TabInputModel<Angle>;
        rz: TabInputModel<Angle>;
    };
};

export interface SampleMoveToNode extends ProgramNode {
    type: 'ur-sample-node-move-to';
    parameters: {
        moveType: MoveType;
        variable: TabInputModel<URVariable | undefined>;
        waypoint?: WaypointTabInputModel;
        advanced: MoveToAdvancedSettings;
    };
}

export interface MoveToAdvancedSettings {
    speed: MoveToSpeedSettings;
    transform: MoveToTransformSettings;
    blend: MoveToBlendSettings;
}

export interface MoveToSpeedSettings {
    speed: TabInputModel<Speed | AngularSpeed>;
    acceleration: TabInputModel<Acceleration | AngularAcceleration>;
}

export interface MoveToBlendSettings {
    enabled: boolean;
    radius?: TabInputModel<Length>;
}

export interface MoveToTransformSettings {
    transform: boolean;
    poseVariable?: URVariable;
}
