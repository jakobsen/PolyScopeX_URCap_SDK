/// <reference lib="webworker" />
import {
    AdvancedProgramLabel,
    ApplicationNodeType,
    EndEffectorNode,
    FramesNode,
    KinematicPosition,
    MoveToBlendSettings,
    MoveToSpeedSettings,
    ProgramBehaviorAPI,
    ProgramBehaviors,
    ProgramLabel,
    ScriptBuilder,
    TCPName,
    TabInputModel,
    URVariable,
    VariableValueType,
    convertValue,
    registerProgramBehavior,
    valueConverter,
} from '@universal-robots/contribution-api';
import { Unit, UnitType } from '@universal-robots/utilities-units';
import { getDefaultJointAcceleration, getDefaultJointSpeed } from './move-to.constants';
import { SampleMoveToNode } from './move-to.node';
import { getDefaultMoveToValidation, MoveToFieldValidation, MoveToValidationResponse } from './move-to.validation.model';

function formatValueWithUnit<T extends UnitType>(currentValue: number, currentUnit: string, newUnit: Unit<T>) {
    const valueWithNewUnit = convertValue(
        {
            value: currentValue,
            unit: currentUnit,
        },
        newUnit.label,
    );
    return valueConverter(valueWithNewUnit, newUnit);
}

async function convertedValuesForMoveType(moveType: string, node: SampleMoveToNode) {
    const api = new ProgramBehaviorAPI(self);
    const units = (await api.settingsService.getRobotSettingsOnce()).units;

    if (moveType == 'Joint') {
        const speedType = units.ANGULAR_SPEED;
        const accelerationType = units.ANGULAR_ACCELERATION;

        return {
            convertedSpeed: formatValueWithUnit(Number(node.parameters.advanced.speed.speed.value), 'rad/s', speedType),
            convertedAcceleration: formatValueWithUnit(
                Number(node.parameters.advanced.speed.acceleration.value),
                'rad/s^2',
                accelerationType,
            ),
        };
    } else {
        const speedType = units.SPEED;
        const accelerationType = units.ACCELERATION;

        return {
            convertedSpeed: formatValueWithUnit(Number(node.parameters.advanced.speed.speed.value), 'm/s', speedType),
            convertedAcceleration: formatValueWithUnit(
                Number(node.parameters.advanced.speed.acceleration.value),
                'm/s^2',
                accelerationType,
            ),
        };
    }
}

const behaviors: ProgramBehaviors<SampleMoveToNode> = {
    programNodeLabel: async (node: SampleMoveToNode): Promise<ProgramLabel> => {
        const variable = node.parameters.variable;
        const frame = node.parameters.waypoint?.frame;
        const tcpName = node.parameters.waypoint?.tcp?.name;
        const moveType = node.parameters.moveType === 'moveJ' ? 'Joint' : 'Linear';

        if ((!variable.selectedType || !variable.entity) && variable.selectedType !== 'EXPRESSION') {
            return [{ type: 'primary', value: '' }];
        }

        const name = (variable.entity ? variable.entity.name : '') + (variable.selectedType === 'VARIABLE' ? ' (Variable)' : '');

        if ((!frame || !tcpName) && variable.selectedType !== 'EXPRESSION') {
            return [
                { type: 'secondary', value: `web-sdk-external ` },
                { type: 'secondary', value: `${moveType}` },
            ];
        }

        if (variable.selectedType === 'EXPRESSION') {
            return [{ type: 'secondary', value: `${variable.value}` }];
        }

        const convertedValues = await convertedValuesForMoveType(moveType, node);
        const convertedSpeed = convertedValues.convertedSpeed;
        const convertedAcceleration = convertedValues.convertedAcceleration;
        const advancedLabel: AdvancedProgramLabel = [
            { type: 'primary', value: name },
            { type: 'secondary', value: frame ?? '' },
            { type: 'secondary', value: tcpName ?? '' },
            { type: 'secondary', value: moveType },
            {
                type: 'secondary',
                value: `S: ${convertedSpeed}`,
            },
            {
                type: 'secondary',
                value: `A: ${convertedAcceleration}`,
            },
        ];

        if (node.parameters.advanced.transform.transform) {
            advancedLabel.push({ type: 'secondary', value: `Transformed: ${node.parameters.advanced.transform.poseVariable?.name}` });
        }

        return advancedLabel;
    },
    factory: async (): Promise<SampleMoveToNode> => {
        const api = new ProgramBehaviorAPI(self);
        const pointName = await api.symbolService.generateVariable('Point', VariableValueType.WAYPOINT);
        return {
            version: '0.0.3',
            type: 'ur-sample-node-move-to',
            allowsChildren: false,
            parameters: {
                moveType: 'moveJ',
                variable: new TabInputModel<URVariable>(pointName, 'VALUE', pointName.name),
                waypoint: undefined,
                advanced: {
                    speed: {
                        speed: getDefaultJointSpeed(),
                        acceleration: getDefaultJointAcceleration(),
                    },
                    blend: {
                        enabled: false,
                    },
                    transform: {
                        transform: false,
                        poseVariable: undefined,
                    },
                },
            },
        };
    },
    validator: async (node: SampleMoveToNode): Promise<MoveToValidationResponse> => {
        const api = new ProgramBehaviorAPI(self);
        const variable = node.parameters.variable;
        const waypoint = node.parameters.waypoint;
        const fieldValidation: MoveToFieldValidation = getDefaultMoveToValidation();
        if (!variable) {
            fieldValidation.point = false;
            return { isValid: false, fieldValidation };
        }

        if (variable.selectedType === 'VALUE' && !waypoint) {
            fieldValidation.position = false;
        }

        if (variable.selectedType === 'VARIABLE') {
            if (!variable.entity) {
                fieldValidation.point = false;
            } else {
                const variableExists = await isValidVariable(variable.entity.name, api);
                if (!variableExists) {
                    fieldValidation.point = false;
                }
            }
        }

        if (variable.selectedType === 'EXPRESSION') {
            const expressionEmpty = (variable.value as string).length === 0;
            if (expressionEmpty) {
                fieldValidation.point = false;
            }
        }

        const advanced = node.parameters.advanced;

        // If speed settings are set to variables they should be valid
        if (advanced.speed.speed.selectedType === 'VARIABLE') {
            const variableExists = await isValidVariable(advanced.speed.speed.value as string, api);
            if (!variableExists) {
                fieldValidation.advanced.speed = false;
            }
        }
        if (advanced.speed.acceleration.selectedType === 'VARIABLE') {
            const variableExists = await isValidVariable(advanced.speed.acceleration.value as string, api);
            if (!variableExists) {
                fieldValidation.advanced.acceleration = false;
            }
        }

        // If a pose is set for the Move node, it should be a valid variable name:
        if (advanced.transform?.transform && advanced.transform.poseVariable) {
            const poseVar = advanced.transform.poseVariable;
            const variableExists = await isValidVariable(poseVar.name, api);
            if (!variableExists) {
                fieldValidation.advanced.transform = false;
            }
        }

        const frameId = waypoint?.frame;
        if (frameId) {
            fieldValidation.advanced.frame = await isValidFrame(frameId, api);
        }
        const tcpName = waypoint?.tcp;
        if (tcpName) {
            fieldValidation.advanced.tcp = await isValidTcp(tcpName, api);
        }

        // If blend radius is enabled and set to a variable, is should be a valid variable
        if (advanced.blend.enabled && advanced.blend.radius?.selectedType === 'VARIABLE') {
            const variableExists = await isValidVariable(advanced.blend.radius.value as string, api);
            if (!variableExists) {
                fieldValidation.advanced.blend = false;
            }
        }

        const hasInvalidField = [fieldValidation.point, fieldValidation.position, ...Object.values(fieldValidation.advanced)].some(
            (valid: boolean) => !valid,
        );

        return { isValid: !hasInvalidField, fieldValidation };
    },
    generateCodeBeforeChildren: async (node: SampleMoveToNode): Promise<ScriptBuilder> => {
        const builder = new ScriptBuilder();

        const moveFunction = node.parameters.moveType === 'moveJ' ? builder.movej : builder.movel;
        // Set new active tcp if it saved in reference settings
        if (node.parameters.waypoint?.tcp && node.parameters.variable) {
            const api = new ProgramBehaviorAPI(self);
            const eeNode = (await api.applicationService.getApplicationNode(ApplicationNodeType.END_EFFECTOR)) as EndEffectorNode;

            const tcpName = node.parameters.waypoint.tcp?.name;

            const tcp = eeNode.endEffectors.flatMap((ee) => ee.tcps).find((tcp) => tcp.name === tcpName);

            if (tcp) {
                builder.setTcp(tcp.x.value, tcp.y.value, tcp.z.value, tcp.rx.value, tcp.ry.value, tcp.rx.value, tcp.name);
            }
        }
        const destination = await getDestinationString(node);
        const speed = getSpeed(node.parameters.advanced.speed);
        const acceleration = getAcceleration(node.parameters.advanced.speed);
        const blendRadius = getBlendRadius(node.parameters.advanced.blend);

        return moveFunction.call(builder, destination, acceleration, speed, undefined, blendRadius);
    },
    generateCodePreamble: async (node: SampleMoveToNode): Promise<ScriptBuilder> => {
        const builder = new ScriptBuilder();
        const variable = node.parameters.variable;
        const waypoint = node.parameters.waypoint;
        if (variable.selectedType === 'VALUE' && variable.entity?.name && waypoint) {
            // TODO create waypoint variable
        }
        return builder;
    },

    upgradeNode: async (node: SampleMoveToNode): Promise<SampleMoveToNode> => {
        if (node.version === '0.0.1') {
            node = await upgradeTo002(node);
        }
        return node;
    },
};

async function upgradeTo002(node: SampleMoveToNode) {
    // Convert from the old KinematicPosition to the new Waypoint model and store in WaupointTabInputModel
    const point = (node.parameters as any).point;
    const { position, variable } = point.entity as { position: KinematicPosition; variable: URVariable };
    if (point.selectedType === 'VALUE') {
        // TODO create updated waypoint variable
    } else {
        node.parameters.variable = new TabInputModel<URVariable>(variable, point.selectedType, point.value);
        node.parameters.waypoint = undefined;
    }
    delete (node.parameters as any).point;
    delete (node.parameters.advanced as any).reference;
    node.version = '0.0.2';
    return node;
}

async function getDestinationString(node: SampleMoveToNode): Promise<string> {
    if (node.parameters.variable.selectedType === 'EXPRESSION') {
        return node.parameters.variable.value as string;
    }

    const moveType = node.parameters.moveType;
    const variable = node.parameters.variable.entity as URVariable;
    let targetPoseString: string;

    const frameId = node.parameters.waypoint?.frame;
    if (frameId === 'base') {
        targetPoseString = `${variable.name}.p`;
    } else {
        targetPoseString = `convert_pose(${variable.name}.p, ${variable.name}.frame, "base")`;
    }

    if (node.parameters.advanced.transform.transform && node.parameters.advanced.transform.poseVariable?.name) {
        targetPoseString = `pose_trans(${targetPoseString}, ${node.parameters.advanced.transform.poseVariable.name})`;
    }

    if (moveType === 'moveL') {
        return targetPoseString;
    }
    if (moveType === 'moveJ') {
        return `get_inverse_kin(${targetPoseString}, qnear=${variable.name}.q)`;
    }

    return '';
}

function getSpeed(speedSettings: MoveToSpeedSettings) {
    return speedSettings.speed.value;
}

function getAcceleration(speedSettings: MoveToSpeedSettings) {
    return speedSettings.acceleration.value;
}

function getBlendRadius(blendSettings: MoveToBlendSettings) {
    if (blendSettings.enabled && blendSettings.radius) {
        return blendSettings.radius.value;
    }
    return undefined;
}

async function isValidVariable(variableName: string, api: ProgramBehaviorAPI): Promise<boolean> {
    const isRegistered = await api.symbolService.isRegisteredVariableName(variableName);
    const isSuppressed = await api.symbolService.isSuppressed(variableName);
    return isRegistered && !isSuppressed;
}
/**
 * Check if the frame is valid. If the frame is not set, it is considered valid.
 */
async function isValidFrame(frameId: string, api: ProgramBehaviorAPI): Promise<boolean> {
    const framesList = ((await api.applicationService.getApplicationNode(ApplicationNodeType.FRAMES)) as FramesNode).framesList;
    return !!framesList.some((frame) => frame.name === frameId);
}
/**
 * Check if the TCP is valid. If the TCP is not set, it is considered valid.
 */
async function isValidTcp(tcpName: TCPName, api: ProgramBehaviorAPI): Promise<boolean> {
    const eeNode = (await api.applicationService.getApplicationNode(ApplicationNodeType.END_EFFECTOR)) as EndEffectorNode;
    return !!eeNode.endEffectors.flatMap((ee) => ee.tcps).find((tcp) => tcp.id === tcpName.id);
}
registerProgramBehavior(behaviors);
