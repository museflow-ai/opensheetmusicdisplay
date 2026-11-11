import {MusicSheet} from "../../MusicSheet";
import {IXmlElement} from "../../../Common/FileIO/Xml";
import {SourceMeasure} from "../../VoiceData/SourceMeasure";
import {RepetitionInstruction, RepetitionInstructionEnum, AlignmentType} from "../../VoiceData/Instructions/RepetitionInstruction";
import {RepetitionInstructionComparer} from "../../VoiceData/Instructions/RepetitionInstruction";
import {StringUtil} from "../../../Common/Strings/StringUtil";
export class RepetitionInstructionReader {
  /**
   * A global list of all repetition instructions in the musicsheet.
   */
  public repetitionInstructions: RepetitionInstruction[];
  public xmlMeasureList: IXmlElement[][];
  private musicSheet: MusicSheet;
  private currentMeasureIndex: number;
  /** The number attributes of the open endings whose start the file hides (print-object="no"), and of those it shows.
   *  An ending only hidden has its stop hidden too (Finale writes a shown start and a hidden copy of it, #1367). */
  private hiddenEndingNumbers: Set<string> = new Set<string>();
  private shownEndingNumbers: Set<string> = new Set<string>();

  public set MusicSheet(value: MusicSheet) {
    this.musicSheet = value;
    this.xmlMeasureList = new Array(this.musicSheet.Instruments.length);
    this.repetitionInstructions = [];
    this.hiddenEndingNumbers = new Set<string>();
    this.shownEndingNumbers = new Set<string>();
  }

  /**
   * is called when starting reading an xml measure
   * @param measure
   * @param currentMeasureIndex
   */
  public prepareReadingMeasure(measure: SourceMeasure, currentMeasureIndex: number): void {
    this.currentMeasureIndex = currentMeasureIndex;
  }

  public handleLineRepetitionInstructions(barlineNode: IXmlElement): boolean {
    let pieceEndingDetected: boolean = false;
    if (barlineNode.elements().length > 0) {
      let location: string = "";
      let hasRepeat: boolean = false;
      let direction: string = "";
      let type: string = "";
      let style: string = "";
      const endingIndices: number[] = [];

      // read barline style
      const styleNode: IXmlElement = barlineNode.element("bar-style");

      // if location is ommited in Xml, right is implied (from documentation)
      if (styleNode) {
        style = styleNode.value;
      }
      if (barlineNode.attributes().length > 0 && barlineNode.attribute("location")) {
        location = barlineNode.attribute("location").value;
      } else {
        location = "right";
      }
      const barlineNodeElements: IXmlElement[] = barlineNode.elements();

      // read repeat- or ending line information
      for (let idx: number = 0, len: number = barlineNodeElements.length; idx < len; ++idx) {
        const childNode: IXmlElement = barlineNodeElements[idx];
        if ("repeat" === childNode.name && childNode.hasAttributes) {
          hasRepeat = true;
          direction = childNode.attribute("direction").value;
        } else if ( "ending" === childNode.name && childNode.hasAttributes &&
                    childNode.attribute("type") !== undefined && childNode.attribute("number")) {
          const endingNumber: string = childNode.attribute("number").value;
          if (childNode.attribute("print-object")?.value === "no") {
            if (childNode.attribute("type").value === "start") {
              this.hiddenEndingNumbers.add(endingNumber);
            }
            continue;
            // Finale only puts print-object="no" at the (duplicated) <ending> node at thestart of measure barline,
            //   making this uneffective. Unclear whether the intention is to render the volta or not. (See #1367)
          }
          if (childNode.attribute("type").value === "start") {
            this.shownEndingNumbers.add(endingNumber);
          } else {
            const onlyHidden: boolean = this.hiddenEndingNumbers.has(endingNumber) && !this.shownEndingNumbers.has(endingNumber);
            this.hiddenEndingNumbers.delete(endingNumber);
            this.shownEndingNumbers.delete(endingNumber);
            if (onlyHidden) {
              // the end of an ending the file hides: drawn on its own it would be a stray closing hook
              continue;
            }
          }
          type = childNode.attribute("type").value;
          // The number attribute says on which passes the ending is played, e.g. "1, 2, 3, 4, 5".
          //   MusicXML spec: "The element text is used when the text displayed in the ending is different than what appears in the number attribute."
          //   Finale v27.3 puts the printed number in the text instead of in "number" (number="1" for a "2", #1367): the text's numbers
          //   are used when they share none with the attribute's.
          let numbers: number[] = RepetitionInstructionReader.readEndingNumbers(childNode.attribute("number").value);
          const text: string = childNode.value ? childNode.value.trim() : "";
          if (text) {
            const textNumbers: number[] = RepetitionInstructionReader.readEndingNumbers(text);
            if (textNumbers.length > 0 && !textNumbers.some((textNumber: number): boolean => numbers.includes(textNumber))) {
              numbers = textNumbers;
            }
          }
          endingIndices.push(...numbers);
        }
      }

      // reset measure counter if not lastMeasure
      if (style === "light-heavy" && endingIndices.length === 0 && !hasRepeat) {
        pieceEndingDetected = true;
      }
      if (hasRepeat || endingIndices.length > 0) {
        if (location === "left") {
          if (type === "start") {
            const newInstruction: RepetitionInstruction = new RepetitionInstruction(this.currentMeasureIndex, RepetitionInstructionEnum.Ending,
                                                                                    AlignmentType.Begin, undefined, endingIndices);
            this.addInstruction(this.repetitionInstructions, newInstruction);
          }
          if (direction === "forward") {
            // start new Repetition
            const newInstruction: RepetitionInstruction = new RepetitionInstruction(this.currentMeasureIndex, RepetitionInstructionEnum.StartLine);
            this.addInstruction(this.repetitionInstructions, newInstruction);
          }
        } else { // location right
          if (type === "stop") {
            const newInstruction: RepetitionInstruction = new RepetitionInstruction(this.currentMeasureIndex, RepetitionInstructionEnum.Ending,
                                                                                    AlignmentType.End, undefined, endingIndices);
            this.addInstruction(this.repetitionInstructions, newInstruction);
          }
          if (direction === "backward") {
            const newInstruction: RepetitionInstruction = new RepetitionInstruction(this.currentMeasureIndex, RepetitionInstructionEnum.BackJumpLine);
            this.addInstruction(this.repetitionInstructions, newInstruction);
          }
        }
      }
    }
    return pieceEndingDetected;
  }

  /** The ending numbers a number attribute or an ending's text gives: "1, 2" or "1 + 2" or "1. 2. 3." or "1 - 3, 6". */
  public static readEndingNumbers(value: string): number[] {
    const numbers: number[] = [];
    for (const part of value.split(/[,+]/)) {
      const numberTexts: string[] = part.match(/\d+/g) ?? [];
      if (numberTexts.length === 2 && part.includes("-")) {
        for (let index: number = parseInt(numberTexts[0], 10); index <= parseInt(numberTexts[1], 10); index++) {
          numbers.push(index);
        }
      } else {
        for (const numberText of numberTexts) {
          numbers.push(parseInt(numberText, 10));
        }
      }
    }
    return numbers;
  }

  public handleRepetitionInstructionsFromWordsOrSymbols(directionTypeNode: IXmlElement, relativeMeasurePosition: number): boolean {
    const wordsNode: IXmlElement = directionTypeNode.element("words");
    const measureIndex: number = this.currentMeasureIndex;
    if (wordsNode) {
      const dsRegEx: string = "d\\s?\\.s\\."; // Input for new RegExp(). TS eliminates the first \
      // must Trim string and ToLower before compare
      const innerText: string = wordsNode.value.trim().toLowerCase();
      if (StringUtil.StringContainsSeparatedWord(innerText, dsRegEx + " al fine", true)) {
        // @correctness i don't think we should manipulate the measure index by relative position [ssch]
        //   it's clearly assigned a measure in the xml
        //   this has misfired in the past, see test_staverepetitions_coda_etc_positioning.musicxml
        //   there, it put the 'To Coda' in measure 1, same as the 'Signo', which was not correct.
        // if (relativeMeasurePosition < 0.5 && this.currentMeasureIndex < this.xmlMeasureList[0].length - 1) { // not in last measure
        //   measureIndex--;
        // }
        const newInstruction: RepetitionInstruction = new RepetitionInstruction(measureIndex, RepetitionInstructionEnum.DalSegnoAlFine);
        this.addInstruction(this.repetitionInstructions, newInstruction);
        return true;
      }
      const dcRegEx: string = "d\\.\\s?c\\.";
      if (StringUtil.StringContainsSeparatedWord(innerText, dcRegEx + " al coda", true)) {
        // if (relativeMeasurePosition < 0.5) {
        //   measureIndex--;
        // }
        const newInstruction: RepetitionInstruction = new RepetitionInstruction(measureIndex, RepetitionInstructionEnum.DaCapoAlCoda);
        this.addInstruction(this.repetitionInstructions, newInstruction);
        return true;
      }
      if (StringUtil.StringContainsSeparatedWord(innerText, dcRegEx + " al fine", true)) {
        // if (relativeMeasurePosition < 0.5 && this.currentMeasureIndex < this.xmlMeasureList[0].length - 1) { // not in last measure
        //   measureIndex--;
        // }
        const newInstruction: RepetitionInstruction = new RepetitionInstruction(measureIndex, RepetitionInstructionEnum.DaCapoAlFine);
        this.addInstruction(this.repetitionInstructions, newInstruction);
        return true;
      }
      if (StringUtil.StringContainsSeparatedWord(innerText, dcRegEx + " al coda", true)) {
        // if (relativeMeasurePosition < 0.5) {
        //   measureIndex--;
        // }
        const newInstruction: RepetitionInstruction = new RepetitionInstruction(measureIndex, RepetitionInstructionEnum.DaCapoAlCoda);
        this.addInstruction(this.repetitionInstructions, newInstruction);
        return true;
      }
      if (StringUtil.StringContainsSeparatedWord(innerText, dcRegEx) ||
        StringUtil.StringContainsSeparatedWord(innerText, "da\\s?capo", true)) {
        // if (relativeMeasurePosition < 0.5 && this.currentMeasureIndex < this.xmlMeasureList[0].length - 1) { // not in last measure
        //   measureIndex--;
        // }
        const newInstruction: RepetitionInstruction = new RepetitionInstruction(measureIndex, RepetitionInstructionEnum.DaCapo);
        this.addInstruction(this.repetitionInstructions, newInstruction);
        return true;
      }
      if (StringUtil.StringContainsSeparatedWord(innerText, dsRegEx, true) ||
        StringUtil.StringContainsSeparatedWord(innerText, "dal\\s?segno", true)) {
        // if (relativeMeasurePosition < 0.5 && this.currentMeasureIndex < this.xmlMeasureList[0].length - 1) { // not in last measure
        //   measureIndex--;
        // }
        let newInstruction: RepetitionInstruction;
        if (StringUtil.StringContainsSeparatedWord(innerText, "al\\s?coda", true)) {
          newInstruction = new RepetitionInstruction(measureIndex, RepetitionInstructionEnum.DalSegnoAlCoda);
        } else {
          newInstruction = new RepetitionInstruction(measureIndex, RepetitionInstructionEnum.DalSegno);
        }
        this.addInstruction(this.repetitionInstructions, newInstruction);
        return true;
      }
      if (StringUtil.StringContainsSeparatedWord(innerText, "to\\s?coda", true) ||
        StringUtil.StringContainsSeparatedWord(innerText, "a (la )?coda", true)) {
        // if (relativeMeasurePosition < 0.5) {
        //   measureIndex--;
        // }
        const newInstruction: RepetitionInstruction = new RepetitionInstruction(measureIndex, RepetitionInstructionEnum.ToCoda);
        this.addInstruction(this.repetitionInstructions, newInstruction);
        return true;
      }
      if (StringUtil.StringContainsSeparatedWord(innerText, "fine", true)) {
        // if (relativeMeasurePosition < 0.5) {
        //   measureIndex--;
        // }
        const newInstruction: RepetitionInstruction = new RepetitionInstruction(measureIndex, RepetitionInstructionEnum.Fine);
        this.addInstruction(this.repetitionInstructions, newInstruction);
        return true;
      }
      if (StringUtil.StringContainsSeparatedWord(innerText, "coda", true)) {
        // if (relativeMeasurePosition > 0.5) {
        //   measureIndex++;
        // }
        const newInstruction: RepetitionInstruction = new RepetitionInstruction(measureIndex, RepetitionInstructionEnum.Coda);
        this.addInstruction(this.repetitionInstructions, newInstruction);
        return true;
      }
      if (StringUtil.StringContainsSeparatedWord(innerText, "segno", true)) {
        // if (relativeMeasurePosition > 0.5) {
        //   measureIndex++;
        // }
        const newInstruction: RepetitionInstruction = new RepetitionInstruction(measureIndex, RepetitionInstructionEnum.Segno);
        this.addInstruction(this.repetitionInstructions, newInstruction);
        return true;
      }
    } else if (directionTypeNode.element("segno")) {
      // if (relativeMeasurePosition > 0.5) {
      //   measureIndex++;
      // }
      const newInstruction: RepetitionInstruction = new RepetitionInstruction(measureIndex, RepetitionInstructionEnum.Segno);
      this.addInstruction(this.repetitionInstructions, newInstruction);
      return true;
    } else if (directionTypeNode.element("coda")) {
      // if (relativeMeasurePosition > 0.5) {
      //   measureIndex++;
      // }
      const newInstruction: RepetitionInstruction = new RepetitionInstruction(measureIndex, RepetitionInstructionEnum.Coda);
      this.addInstruction(this.repetitionInstructions, newInstruction);
      return true;
    }
    return false;
  }

  public removeRedundantInstructions(): void {
    let segnoCount: number = 0;
    let codaCount: number = 0;
    //const fineCount: number = 0;
    let toCodaCount: number = 0;
    let dalSegnaCount: number = 0;
    for (let index: number = 0; index < this.repetitionInstructions.length; index++) {
      const instruction: RepetitionInstruction = this.repetitionInstructions[index];
      switch (instruction.type) {
        case RepetitionInstructionEnum.Coda:
          if (toCodaCount > 0) {
            if (this.findInstructionInPreviousMeasure(index, instruction.measureIndex, RepetitionInstructionEnum.ToCoda)) {
              instruction.type = RepetitionInstructionEnum.None;
            }
          }
          // TODO this prevents a piece consisting of a single coda sign showing coda (will show To Coda)
          // if (codaCount === 0 && toCodaCount === 0) {
          //   instruction.type = RepetitionInstructionEnum.ToCoda;
          //   instruction.alignment = AlignmentType.End;
          //   instruction.measureIndex--;
          // }
          break;
        case RepetitionInstructionEnum.Segno:
          if (segnoCount - dalSegnaCount > 0) { // two segnos in a row
            let foundInstruction: boolean = false;
            for (let idx: number = 0, len: number = this.repetitionInstructions.length; idx < len; ++idx) {
              const instr: RepetitionInstruction = this.repetitionInstructions[idx];
              if (instruction.measureIndex - instr.measureIndex === 1) {
                switch (instr.type) {
                  case RepetitionInstructionEnum.BackJumpLine:
                    if (toCodaCount - codaCount > 0) { // open toCoda existing
                      instr.type = RepetitionInstructionEnum.DalSegnoAlCoda;
                    } else {
                      instr.type = RepetitionInstructionEnum.DalSegno;
                    }
                    instruction.type = RepetitionInstructionEnum.None;
                    foundInstruction = true;
                    break;
                  case RepetitionInstructionEnum.DalSegno:
                  case RepetitionInstructionEnum.DalSegnoAlFine:
                  case RepetitionInstructionEnum.DalSegnoAlCoda:
                    instruction.type = RepetitionInstructionEnum.None;
                    foundInstruction = true;
                    break;
                  default:
                    break;
                }
              }
              if (foundInstruction) {
                break;
              }
            }
            if (foundInstruction) {
              break;
            }
            // convert to dal segno instruction:
            if (toCodaCount - codaCount > 0) { // open toCoda existing
              instruction.type = RepetitionInstructionEnum.DalSegnoAlCoda;
            } else {
              instruction.type = RepetitionInstructionEnum.DalSegno;
            }
            instruction.alignment = AlignmentType.End;
            instruction.measureIndex--;
          }
          break;
        default:
          break;
      }

      // check if this  instruction already exists or is otherwise redundant:
      if (this.backwardSearchForPreviousIdenticalInstruction(index, instruction) || instruction.type === RepetitionInstructionEnum.None) {
        this.repetitionInstructions.splice(index, 1);
        index--;
      } else {
        switch (instruction.type) {
          case RepetitionInstructionEnum.Fine:
            //fineCount++;
            break;
          case RepetitionInstructionEnum.ToCoda:
            toCodaCount++;
            break;
          case RepetitionInstructionEnum.Coda:
            codaCount++;
            break;
          case RepetitionInstructionEnum.Segno:
            segnoCount++;
            break;
          case RepetitionInstructionEnum.DalSegnoAlFine:
          case RepetitionInstructionEnum.DalSegnoAlCoda:
            dalSegnaCount++;
            break;
          default:
            break;
        }
      }
    }
    this.repetitionInstructions.sort(RepetitionInstructionComparer.Compare);
  }

  private findInstructionInPreviousMeasure(currentInstructionIndex: number, currentMeasureIndex: number, searchedType: RepetitionInstructionEnum): boolean {
    for (let index: number = currentInstructionIndex - 1; index >= 0; index--) {
      const instruction: RepetitionInstruction = this.repetitionInstructions[index];
      if (currentMeasureIndex - instruction.measureIndex === 1 && instruction.type === searchedType) {
        return true;
      }
    }
    return false;
  }

  private backwardSearchForPreviousIdenticalInstruction(currentInstructionIndex: number, currentInstruction: RepetitionInstruction): boolean {
    for (let index: number = currentInstructionIndex - 1; index >= 0; index--) {
      const instruction: RepetitionInstruction = this.repetitionInstructions[index];
      if (instruction.equals(currentInstruction)) {
        return true;
      }
    }
    return false;
  }

  private addInstruction(currentRepetitionInstructions: RepetitionInstruction[], newInstruction: RepetitionInstruction): void {
    let addInstruction: boolean = true;
    for (let idx: number = 0, len: number = currentRepetitionInstructions.length; idx < len; ++idx) {
      const repetitionInstruction: RepetitionInstruction = currentRepetitionInstructions[idx];
      if (newInstruction.equals(repetitionInstruction)) {
        addInstruction = false;
        break;
      }
    }
    if (addInstruction) {
      currentRepetitionInstructions.push(newInstruction);
    }
  }
}
