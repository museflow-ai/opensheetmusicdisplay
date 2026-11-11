import { OpenSheetMusicDisplay } from "../../../src/OpenSheetMusicDisplay/OpenSheetMusicDisplay";
import { RepetitionInstructionReader } from "../../../src/MusicalScore/ScoreIO/MusicSymbolModules/RepetitionInstructionReader";
import { VexFlowMeasure } from "../../../src/MusicalScore/Graphical/VexFlow/VexFlowMeasure";
import { GraphicalMeasure } from "../../../src/MusicalScore/Graphical/GraphicalMeasure";
import { TestUtils } from "../../Util/TestUtils";
import Vex from "vexflow";
import VF = Vex.Flow;

/** The drawn state of a VexFlow tuplet after rendering. */
interface DrawnTuplet {
    RenderTupletNumber?: boolean;
    bracketed: boolean;
}

/** A measure's VexFlow tuplets by voice (a private field of VexFlowMeasure). */
interface MeasureTuplets {
    vftuplets: { [voiceID: number]: DrawnTuplet[] };
}

/** A VexFlow volta (ending bracket) modifier of a stave. */
interface DrawnVolta {
    number: string;
}

function score(partContent: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">${partContent}</part>
</score-partwise>`;
}

const ATTRIBUTES: string = `<attributes><divisions>6</divisions><key><fifths>0</fifths></key>
  <time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>`;

function note(step: string, notations: string = ""): string {
    return `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice>
  <type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
  ${notations}</note>`;
}

/** Two triplets: the first hidden the way MuseScore hides one, the second shown. */
const HIDDEN_AND_SHOWN_TRIPLETS: string = score(`<measure number="1">${ATTRIBUTES}
  ${note("C", "<notations print-object=\"no\"><tuplet type=\"start\" bracket=\"yes\"/></notations>")}
  ${note("D")}
  ${note("E", "<notations print-object=\"no\"><tuplet type=\"stop\"/></notations>")}
  ${note("F", "<notations><tuplet type=\"start\" bracket=\"yes\"/></notations>")}
  ${note("G")}
  ${note("A", "<notations><tuplet type=\"stop\"/></notations>")}
</measure>`);

function wholeBar(number: number, barlines: string): string {
    return `<measure number="${number}">${number === 1 ? ATTRIBUTES : ""}${barlines}
  <note><pitch><step>C</step><octave>4</octave></pitch><duration>12</duration><voice>1</voice><type>half</type></note>
</measure>`;
}

/** A repeat whose first ending is played five times (Satie's "1, 2, 3, 4, 5"), then a sixth ending. */
const FIVE_PASS_ENDING: string = score(
    wholeBar(1, "<barline location=\"left\"><repeat direction=\"forward\"/></barline>") +
    wholeBar(2, "<barline location=\"left\"><ending number=\"1, 2, 3, 4, 5\" type=\"start\">1. 2. 3. 4. 5.</ending></barline>")
        .replace("</measure>", `<barline location="right"><ending number="1, 2, 3, 4, 5" type="stop"/>
  <repeat direction="backward" times="6"/></barline></measure>`) +
    wholeBar(3, "<barline location=\"left\"><ending number=\"6\" type=\"start\">6.</ending></barline>")
        .replace("</measure>", "<barline location=\"right\"><ending number=\"6\" type=\"discontinue\"/></barline></measure>")
);

/** A first ending the file hides (MuseScore writes print-object="no" on its start only). */
const HIDDEN_ENDING: string = score(
    wholeBar(1, "<barline location=\"left\"><repeat direction=\"forward\"/></barline>") +
    wholeBar(2, "<barline location=\"left\"><ending number=\"1\" type=\"start\" print-object=\"no\">1.</ending></barline>")
        .replace("</measure>", "<barline location=\"right\"><ending number=\"1\" type=\"stop\"/><repeat direction=\"backward\"/></barline></measure>") +
    wholeBar(3, "")
);

function render(xml: string): Promise<OpenSheetMusicDisplay> {
    const div: HTMLElement = TestUtils.getDivElement(document);
    const osmd: OpenSheetMusicDisplay = new OpenSheetMusicDisplay(div, { autoResize: false, backend: "svg" });
    return osmd.load(xml).then(() => {
        osmd.render();
        return osmd;
    });
}

function measures(osmd: OpenSheetMusicDisplay): VexFlowMeasure[] {
    return osmd.GraphicSheet.MeasureList
        .flat()
        .filter((measure: GraphicalMeasure): boolean => measure instanceof VexFlowMeasure) as VexFlowMeasure[];
}

describe("Ending numbers", () => {
    it("reads every number of a list, a range and a text", () => {
        chai.expect(RepetitionInstructionReader.readEndingNumbers("1")).to.deep.equal([1]);
        chai.expect(RepetitionInstructionReader.readEndingNumbers("1, 2, 3, 4, 5")).to.deep.equal([1, 2, 3, 4, 5]);
        chai.expect(RepetitionInstructionReader.readEndingNumbers("1. 2. 3. 4. 5.")).to.deep.equal([1, 2, 3, 4, 5]);
        chai.expect(RepetitionInstructionReader.readEndingNumbers("1 + 2")).to.deep.equal([1, 2]);
        chai.expect(RepetitionInstructionReader.readEndingNumbers("1 - 3, 6")).to.deep.equal([1, 2, 3, 6]);
        chai.expect(RepetitionInstructionReader.readEndingNumbers("10")).to.deep.equal([10]);
        chai.expect(RepetitionInstructionReader.readEndingNumbers("Last time")).to.deep.equal([]);
    });

    it("labels an ending with every number it is played on", () => {
        return render(FIVE_PASS_ENDING).then((osmd: OpenSheetMusicDisplay) => {
            const labels: string[] = measures(osmd)
                .flatMap((measure: VexFlowMeasure) => measure.getVFStave().getModifiers())
                .filter((modifier: VF.StaveModifier): boolean => modifier.getCategory() === "voltas")
                .map((modifier: VF.StaveModifier): string => String((modifier as unknown as DrawnVolta).number))
                .filter((label: string): boolean => label !== "undefined" && label !== "");
            chai.expect(labels).to.deep.equal(["1, 2, 3, 4, 5", "6"]);
        });
    });
});

describe("Hidden endings", () => {
    it("draws no part of an ending whose start the file hides", () => {
        return render(HIDDEN_ENDING).then((osmd: OpenSheetMusicDisplay) => {
            const voltas: VF.StaveModifier[] = measures(osmd)
                .flatMap((measure: VexFlowMeasure) => measure.getVFStave().getModifiers())
                .filter((modifier: VF.StaveModifier): boolean => modifier.getCategory() === "voltas");
            chai.expect(voltas.length).to.equal(0);
        });
    });
});

describe("Tuplets hidden by their notations", () => {
    it("draws neither number nor bracket for a tuplet in <notations print-object=\"no\">", () => {
        return render(HIDDEN_AND_SHOWN_TRIPLETS).then((osmd: OpenSheetMusicDisplay) => {
            const drawn: DrawnTuplet[] = measures(osmd)
                .flatMap((measure: VexFlowMeasure) => Object.values((measure as unknown as MeasureTuplets).vftuplets).flat());
            chai.expect(drawn.length).to.equal(2);
            chai.expect(drawn[0].RenderTupletNumber).to.equal(false);
            chai.expect(drawn[0].bracketed).to.equal(false);
            chai.expect(drawn[1].RenderTupletNumber).to.equal(true);
            chai.expect(drawn[1].bracketed).to.equal(true);
        });
    });
});
