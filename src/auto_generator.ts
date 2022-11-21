"use strict";
import { program } from "./program";
var merkle_tools_1 = require("@settlemint/merkle-tools");

// some usage of mem: mem[100] used to store roothash
// mem[101] use to store the constraints assertion results, should perform 'and' every time;
// todo1: should set mem[101] to 1 at the beginning of the whole program, `push.mem.101 and  pop.mem.101` then.
// todo2: the roothash should be pushw.mem.100 at the beginning of the whole program as well, used to make sure
//       each auth-path leads to an 'identical' roothash.
// todo3: each roothash which is generated via auth-path should compare with the 'initial roothash' which is stored into at the beginning

// as to each leaf ：
// exec.read_new_leaf exec.read_and_copy exec.multi_rphash loadw.adv(此处导入其uuid) rphash （生成叶子结点的saltedhash）

// before handling each leaf should `push.mem.99` first
// push.mem.99 exec.number_add （push.23 gt）push.mem.101 and pop.mem.101

// overall_program:
// begin
// (accomplish: here is todo1: ) push.1 pop.mem.101
// (accomplish: here is todo2: ) push.adv.4 popw.mem.100

let demo_constraints = [
  {
    fields: [1, 2, 3],
    operation: ["sum", "gt"],
    value: 20.2,
  },
  {
    fields: [0],
    operation: ["gt"],
    value: 19,
  },
];

export function auto_program_generater(leaves_number: any, constraints: any) {
  let whole_program = program;
  for (const key in constraints) {
    if (Object.hasOwnProperty.call(constraints, key)) {
      const element = constraints[key];
      let constraint_program;
      if (element.fields.length == 1) {
        console.log("singlee", element);

        constraint_program = handle_single_constraint(
          leaves_number,
          element.fields[0],
          element.operation[0],
          element.value
        );
      } else {
        constraint_program = handle_multi_constraint(leaves_number, element.fields, element.operation, element.value);
      }
      whole_program = `${whole_program} ${constraint_program}`;
      console.log("whole_program at:",element.operation.toString(),"is :",whole_program)
    }
  }
  whole_program = `
${whole_program}  
    push.mem.101 pushw.mem.100
end`;
  console.log(whole_program);
  return whole_program;
}

// handle single constraint, prepare auth-proc and cons-proc.
function handle_single_constraint(leaves_number: any, fields: any, operation: any, value: any) {
  let auth_program = prepare_auth_path(leaves_number, fields); //[ 'left', 'right', 'right' ]
  let constraint_program;
  let combine_program;
  switch (typeof value) {
    case "string":
      constraint_program = prepare_string_operation(operation, value);
      break;
    case "number":
      constraint_program = prepare_number_operation_single(operation, value);
      break;
    default:
      throw new Error("wait to add more data type.....");
  }
  combine_program = `${auth_program} ${constraint_program}`;
  return combine_program;
}

// field element 有几个先做几次 auth path 的判断，然后将需要参与计算的数字存放在不同的 mem 里，可以从 301 开始，如果是比大小就是存放 301、302，否则存放 301-303
function handle_multi_constraint(leaves_number: any, fields: any, operation: any, value: any) {
  let combine_multi_program = "";
  let auth_read_multi_program = "";
  for (let i = 0; i < fields.length; i++) {
    auth_read_multi_program = prepare_auth_path_and_read_to_mem(leaves_number, fields[i], i);
    combine_multi_program = `${combine_multi_program} ${auth_read_multi_program}`;
  }
  switch (operation[0]) {
    case "sum":
      {
        for (let i = 0; i < fields.length; i++) {
          combine_multi_program = `${combine_multi_program} push.mem.${301 + i}`;
        }
        let decimal = value.toString().split(".").length - 1;
        if (decimal > 1) throw new Error("decimal value has more than 1 digits!");
        if (decimal == 0) {
          combine_multi_program = `
          ${combine_multi_program} 
  repeat.${fields.length - 1} 
      add 
  end
  push.${value} ${operation[1]} push.mem.101 and pop.mem.101
  `;
        } else {
          combine_multi_program = `
              ${combine_multi_program} 
  repeat.${fields.length - 1} 
      add 
  end
  mul.10
  push.${value * 10} ${operation[1]} push.mem.101 and pop.mem.101
`;
        }
      }
      break;
    case "average":
      {
        for (let i = 0; i < fields.length; i++) {
          combine_multi_program = `${combine_multi_program} push.mem.${301 + i}`;
        }
        let decimal = value.toString().split(".").length - 1;
        if (decimal > 1) throw new Error("decimal value has more than 1 digits!");
        if (decimal == 0) {
          combine_multi_program = `
              ${combine_multi_program}
          repeat.${fields.length - 1}
              add
          end
          push.${value * fields.length} ${operation[1]} push.mem.101 and pop.mem.101  
          `;
        } else {
          combine_multi_program = `
              ${combine_multi_program}
  repeat.${fields.length - 1}
      add
  end
  mul.10
  push.${value * 10 * fields.length} ${operation[1]} push.mem.101 and pop.mem.101
          `;
        }
      }
      break;
    default:
      return console.error("error multi constraint!");
  }
  return combine_multi_program;
}

// 用于准备为每个 leaf 准备 auth-proc 并且将对应的数字读出，存入内存（301-303）
function prepare_auth_path_and_read_to_mem(leaves_number: any, field: any, number_to_save: any) {
  let auth_program = prepare_auth_path(leaves_number, field);
  return `${auth_program} 
    push.mem.99 exec.number_add pop.mem.${301 + number_to_save}`;
}

// This function is used to prepare the authentication path for certain leaf, and prepare different code for different leaf
// due to the location (right/left) of a leaf when getting into a new layer.
function prepare_auth_path(leaves_number: any, leaf_index: any) {
  var treeOptions = {
    hashType: "md5",
  };
  var merkleTools = new merkle_tools_1["default"](treeOptions); // treeOptions is optional, we don't care much of the value here
  for (var i = 0; i < leaves_number; i++) {
    // this just a helper function, the hash here doesn't mean anything
    merkleTools.addLeaf("05ae04314577b2783b4be98211d1b72476c59e9c413cfb2afa2f0c68e0d93911", false);
  }
  merkleTools.makeTree(false);
  var to_deal_with = merkleTools.getProof(leaf_index);
  var need_aux_position = [];
  for (var i = 0; i < to_deal_with.length; i++) {
    need_aux_position.push(Object.getOwnPropertyNames(to_deal_with[i]).pop());
  }
  var program_text = "";
  for (const key in need_aux_position) {
    if (Object.hasOwnProperty.call(need_aux_position, key)) {
      const element = need_aux_position[key];
      if (element == "left") {
        program_text = program_text + "push.adv.4" + " swapw rphash ";
      } else {
        program_text = program_text + "push.adv.4" + " rphash ";
      }
    }
  }
  // mem[100] is used to store roothash, compare to the pre-roothash; If not the same, the roothash is wrong
  // (accomplish: todo3)
  program_text = `
    exec.read_new_leaf exec.read_and_copy exec.multi_rphash push.adv.4 rphash 
    ${program_text}
    pushw.mem.100 dupw popw.mem.100 movup.4 eq swap movup.4 eq movup.2 movup.4 
    eq movup.3 movup.4 eq and and and not 
    if.true 
        padw popw.mem.100 
    end `;
  // console.log(program_text)
  return program_text;
}
// use to handle `Single String Constraint`
// todo: this version is deal with the origin RLP code, need to update to field-element in v2.0
function prepare_string_operation(operation: any, value: any) {
  var program_text;

  let compare_text = `push.${value.charCodeAt(0)} eq`;
  for (let i = 1; i < value.length; i++) {
    compare_text = `${compare_text} 
        swap push.${value.charCodeAt(i)} eq`;
  }
  for (let i = 1; i < value.length; i++) {
    compare_text = `${compare_text} and`;
  }

  let read_to_memory = ``;
  for (let i = 0; i < value.length; i++) {
    read_to_memory = `${read_to_memory}    push.${value.charCodeAt(i)} push.${i + 301} pop.mem 
    `;
    // console.log("value.charCodeAt(i) is :", value.charCodeAt(i));
  }

  switch (operation) {
    case "contain":
      // 1. read advice_tape to memory, which start at 301
      // 2. the max compare time should be `mem[99] - value.length` should stored on the second stack.
      // 3. the next address to be compared should stored on stack automatically.
      // 4. mem[300] use to store the compare result(init with 0), once found a success match, mem[300] should be 1. else 0
      program_text = `
    push.mem.99 dup.0 push.${value.length} lte 
    if.true
        push.0 pop.mem.300
        sub.${value.length}${read_to_memory}    dup.0 push.1 gte
        while.true
            push.301 dup.0 push.mem dup.0 push.mem movup.3 eq 
            if.true 
                add.1 dup.0 push.${301 + value.length} eq 
                    if.true
                        push.1 pop.mem.300
                    else
                        swap sub.1 
                    end
            else
                drop push.301 swap sub.1 
            end
            dup.0 push.1 gte movup.2 swap
        end
        push.mem.300 push.mem.101 and pop.mem.101
    else
        dup.0 push.1 gte 
        while.true
            swap drop sub.1 dup.0 push.1 gte
        end
        drop push.0 pop.mem.101
    end`;
      break;
    case "uncontain":
      program_text = `
    push.mem.99 dup.0 push.${value.length} lte 
    if.true
        push.0 pop.mem.300
        sub.${value.length}${read_to_memory}    dup.0 push.1 gte
        while.true
            push.301 dup.0 push.mem dup.0 push.mem movup.3 eq 
            if.true 
                add.1 dup.0 push.${301 + value.length} eq 
                    if.true
                        push.1 pop.mem.300
                    else
                            swap sub.1 
                    end
            else
                drop push.301 swap sub.1 
            end
            dup.0 push.1 gte movup.2 swap
        end
        push.mem.300 not push.mem.101 and pop.mem.101
    else
        dup.0 push.1 gte 
        while.true
            swap drop sub.1 dup.0 push.1 gte
        end
        drop push.0 pop.mem.101
    end
            `;
      break;
    case "start with":
      // here, push.mem.99 needs to be longer than the value.length
      // the first element is at the deepest of the stack.
      program_text = `
    push.mem.99 dup.0 push.${value.length} lte 
    if.true
        sub.${value.length}
        dup.0 push.1 gte
        while.true
            swap drop sub.1 dup.0 push.1 gte
        end
        drop ${compare_text} push.mem.101 and pop.mem.101
    else
        dup.0 push.1 gte 
        while.true
            swap drop sub.1 dup.0 push.1 gte
        end
        drop push.0 pop.mem.101
    end`;
      break;
    case "end with":
      // here, push.mem.99 needs to be longer than the value.length
      // the last element is on the top of the stack.

      program_text = `
    push.mem.99 dup.0 push.${value.length} lte 
    if.true
        pop.mem.99
        ${compare_text} push.mem.101 and pop.mem.101
        push.mem.99 sub.${value.length}
        dup.0 push.1 gte
        while.true
            swap drop sub.1 dup.0 push.1 gte
        end
        drop 
    else
        dup.0 push.1 gte 
        while.true
            swap drop sub.1 dup.0 push.1 gte
        end
        drop push.0 pop.mem.101
    end
            `;
      break;
    default:
      console.error("the string operation is wrong!!!!!");
  }
  return program_text;
}

// use to handle `Single Number Constraint`
function prepare_number_operation_single(operation: any, value: any) {
  var program_text;
  let decimal = value.toString().split(".").length - 1;
  if (decimal > 1) throw new Error("decimal value has more than 1 digits!");
  let multi = decimal == 0 ? 1 : 10;
  switch (operation) {
    case "gt":
      program_text = "push." + value * multi + " gt";
      break;
    case "gte":
      program_text = "push." + value * multi + " gte";
      break;
    case "neq":
      program_text = "push." + value * multi + " neq";
      break;
    case "lte":
      program_text = "push." + value * multi + " lte";
      break;
    case "lt":
      program_text = "push." + value * multi + " lt";
      break;
    default:
      throw new Error("error number compare operation!");
  }
  program_text = `
    push.mem.99 exec.number_add mul.${multi} ${program_text} push.mem.101 and pop.mem.101`;
  return program_text;
}
