/// <reference lib="webworker" />
import {
    AdvancedProgramLabel,
    KinematicPosition,
    ProgramBehaviorAPI,
    ProgramBehaviors,
    registerProgramBehavior,
    ScriptBuilder,
    TabInputModel,
    URVariable,
    ValidationResponse,
    VariableValueType,
    Waypoint,
    WaypointType,
} from '@universal-robots/contribution-api';
import { SelectedInput } from '@universal-robots/ui-models';
import { SampleAssignmentNode } from './assignment.node';

const behaviors: ProgramBehaviors<SampleAssignmentNode> = {
    programNodeLabel,
    factory,
    generateCodeBeforeChildren,
    validator,
    upgradeNode,
};

function programNodeLabel(node: SampleAssignmentNode): AdvancedProgramLabel {
    if (node.parameters.variable.entity.valueType === VariableValueType.WAYPOINT && node.parameters.waypointType === WaypointType.Teach) {
        return [
            {
                type: 'primary',
                value: 'Waypoint:',
            },
            {
                type: 'secondary',
                value: `${node.parameters.variable.entity.name}`,
            },
        ];
    }

    return [
        {
            type: 'primary',
            value: `${node.parameters.variable.entity.name}:`,
        },
        {
            type: 'secondary',
            value: `${node.parameters.variable.value}`,
        },
    ];
}

async function factory(): Promise<SampleAssignmentNode> {
    const api = new ProgramBehaviorAPI(self);
    const variable = await api.symbolService.generateVariable('var', VariableValueType.INTEGER);
    return {
        type: 'ur-sample-node-assignment',
        version: '0.0.2',
        allowsChildren: false,
        parameters: {
            variable: new TabInputModel<URVariable>(variable, 'VALUE', 0),
            waypointType: WaypointType.Teach,
        },
    };
}

async function validator(node: SampleAssignmentNode): Promise<ValidationResponse> {
    const isValidVariable = await variableValidator(node);
    if (!isValidVariable.isValid) {
        return isValidVariable;
    }
    const isValidWaypoint = validateWaypoint(node);
    if (!isValidWaypoint.isValid) {
        return isValidWaypoint;
    }
    const validationResponse = await tabInputValueValidator(node);
    if (!validationResponse.isValid) {
        return validationResponse;
    }
    const suppressedValidationResponse = await suppressedNodeValidator(node);
    if (!suppressedValidationResponse.isValid) {
        return suppressedValidationResponse;
    }
    return { isValid: true };
}

function isWaypointAndTeach(node: SampleAssignmentNode) {
    return node.parameters.variable.entity.valueType === 'waypoint' && node.parameters.waypointType === WaypointType.Teach;
}

async function suppressedNodeValidator(node: SampleAssignmentNode): Promise<ValidationResponse> {
    if (!node.parameters.variable.entity.reference) {
        return { isValid: true };
    }
    const api = new ProgramBehaviorAPI(self);
    const isSuppressed = await api.symbolService.isSuppressed(String(node.parameters.variable.entity.name));
    return isSuppressed ? { isValid: false, errorMessageKey: 'Variable is suppressed' } : { isValid: true };
}

async function tabInputValueValidator(node: SampleAssignmentNode): Promise<ValidationResponse> {
    if (node.parameters.variable.entity.valueType === 'waypoint' && node.parameters.waypointType === WaypointType.Teach) {
        return { isValid: true };
    }
    if (node.parameters.variable.selectedType === SelectedInput.VARIABLE) {
        const api = new ProgramBehaviorAPI(self);
        const value = node.parameters.variable.value.toString();
        const isRegisteredVariableName = await api.symbolService.isRegisteredVariableName(value);
        if (!isRegisteredVariableName) {
            return { isValid: false, errorMessageKey: 'Variable does not exist' };
        }
        const isSuppressed = await api.symbolService.isSuppressed(value);
        if (isSuppressed) {
            return { isValid: false, errorMessageKey: 'Variable is suppressed' };
        }
        const referencedVariable = await api.symbolService.getVariable(value);
        if (referencedVariable?.valueType !== node.parameters.variable.entity.valueType) {
            return { isValid: false, errorMessageKey: 'Variable type mismatch' };
        }
    }
    if (node.parameters.variable.value.toString().length === 0) {
        return { isValid: false, errorMessageKey: 'Missing expression' };
    }
    return { isValid: true };
}

function validateWaypoint(node: SampleAssignmentNode) {
    const variable = node.parameters.variable.entity;
    const waypoint = node.parameters.waypoint;
    const waypointType = node.parameters.waypointType;
    if (variable.valueType !== VariableValueType.WAYPOINT) {
        return { isValid: true };
    }
    if (waypointType === WaypointType.Teach && !waypoint) {
        return { isValid: false };
    }
    return { isValid: true };
}

async function validateVariableName(node: SampleAssignmentNode) {
    const variable = node.parameters.variable.entity;
    if (variable.reference) {
        const api = new ProgramBehaviorAPI(self);
        const isRegisteredVariableName = await api.symbolService.isRegisteredVariableName(variable.name);
        if (!isRegisteredVariableName) {
            return { isValid: false };
        }
        const isSuppressed = await api.symbolService.isSuppressed(variable.name);
        if (isSuppressed) {
            return { isValid: false };
        }
    }
    return { isValid: true };
}

async function variableValidator(node: SampleAssignmentNode): Promise<ValidationResponse> {
    const variableNameValidatorResponse = await validateVariableName(node);
    if (!variableNameValidatorResponse.isValid) {
        return variableNameValidatorResponse;
    }

    const variableTypeValidatorResponse = await variableTypeValidator(node);
    if (!variableTypeValidatorResponse.isValid) {
        return variableTypeValidatorResponse;
    }
    return { isValid: true };
}

async function variableTypeValidator(node: SampleAssignmentNode): Promise<ValidationResponse> {
    const variable = node.parameters.variable.entity;
    if (variable.reference) {
        const api = new ProgramBehaviorAPI(self);
        const declaredVariable = await api.symbolService.getVariable(variable.name);
        if (variable.valueType !== declaredVariable?.valueType) {
            return { isValid: false, errorMessageKey: 'Variable type mismatch' };
        }
    }
    return { isValid: true };
}

async function generateCodeBeforeChildren(node: SampleAssignmentNode): Promise<ScriptBuilder> {
    const builder: ScriptBuilder = new ScriptBuilder();
    const variable = node.parameters.variable.entity;
    const value = node.parameters.variable.value.toString();
    const waypoint = node.parameters.waypoint;
    let expression: string;

    if (isWaypointAndTeach(node) && waypoint) {
        // TODO: create struct expression
    } else {
        expression = value;
    }

    return variable.reference ? builder.assign(variable.name, expression) : builder.globalVariable(variable.name, expression);
}

async function upgradeNode(node: unknown): Promise<SampleAssignmentNode> {
    node = upgradeNodeTo001(node);
    node = await upgradeNodeTo002(node);
    return node as SampleAssignmentNode;
}

registerProgramBehavior(behaviors);

type v001node = Omit<SampleAssignmentNode, 'parameters'> & {
    parameters: {
        waypointOptions?: 'edit' | 'set';
        isValid?: boolean;
        variable: URVariable;
        isNewVariable: boolean;
        expression: string;
        tabInputExpression: TabInputModel<string>;
        waypointParameters?: {
            waypointSource: WaypointType;
            position?: KinematicPosition;
        };
    };
};
type v002node = Omit<SampleAssignmentNode, 'parameters'> & {
    parameters: {
        variable: TabInputModel<URVariable>;
        waypoint?: Waypoint;
        waypointType: WaypointType;
    };
};
async function upgradeNodeTo002(node: unknown): Promise<v002node | unknown> {
    const oldNode = node as any;
    if (oldNode?.version === '0.0.1') {
        const newNode = structuredClone(node) as v002node;
        // clear the old parameters
        newNode.parameters = {} as any;

        let variable: TabInputModel<URVariable>;
        //if the value was float, integer or string, it would have stored the value in the TabInputModel tabInputExpression. Otherwise it was stored in the expression string.
        if (
            oldNode.parameters.variable?.valueType === VariableValueType.FLOAT ||
            oldNode.parameters.variable?.valueType === VariableValueType.INTEGER ||
            oldNode.parameters.variable?.valueType === VariableValueType.STRING
        ) {
            variable = new TabInputModel<URVariable>(
                oldNode.parameters.variable,
                oldNode.parameters.tabInputExpression.selectedType,
                oldNode.parameters.tabInputExpression.value,
            );
        } else {
            variable = new TabInputModel<URVariable>(oldNode.parameters.variable, 'EXPRESSION', oldNode.parameters.expression);
        }
        newNode.parameters.variable = variable;

        //if the type was waypoint and the waypoint was taught
        if (
            oldNode.parameters.variable.valueType === 'waypoint' &&
            oldNode.parameters.waypointParameters?.waypointSource === 'teach' &&
            oldNode.parameters.waypointParameters?.position
        ) {
            // TODO upgrade waypoint model
        }
        newNode.parameters.waypointType = oldNode.parameters.waypointParameters?.waypointSource || WaypointType.Teach;

        newNode.version = '0.0.2';
        return newNode as v002node;
    }
    return node;
}

function upgradeNodeTo001(node: unknown): v001node | unknown {
    if (!(node as any)?.version) {
        const loadedNode = structuredClone(node) as any;
        loadedNode.version = '0.0.1';
        if (!loadedNode.parameters.tabInputExpression) {
            loadedNode.parameters = {
                ...loadedNode.parameters,
                tabInputExpression: {
                    entity: '',
                    selectedType: SelectedInput.VALUE,
                    value: '',
                },
            };
        }
        if (
            'expression' in loadedNode.parameters &&
            !loadedNode.parameters.tabInputExpression?.value &&
            (loadedNode.parameters.variable?.valueType === VariableValueType.STRING ||
                loadedNode.parameters.variable?.valueType === VariableValueType.INTEGER ||
                loadedNode.parameters.variable?.valueType === VariableValueType.FLOAT)
        ) {
            loadedNode.parameters = {
                ...loadedNode.parameters,
                tabInputExpression: {
                    entity: '',
                    selectedType: 'VALUE',
                    value: loadedNode.parameters.expression,
                },
            };
        }
        if (
            loadedNode.parameters.tabInputExpression?.value !== '' &&
            loadedNode.parameters.expression === '' &&
            loadedNode.parameters.variable?.valueType !== VariableValueType.STRING &&
            loadedNode.parameters.variable?.valueType !== VariableValueType.INTEGER &&
            loadedNode.parameters.variable?.valueType !== VariableValueType.FLOAT
        ) {
            loadedNode.parameters = {
                ...loadedNode.parameters,
                expression: loadedNode.parameters.tabInputExpression.value.toString(),
            };
        }
        return loadedNode as v001node;
    }
    return node;
}
