import CommonToolUtils from '@/utils/tool/CommonToolUtils';
import { BasicToolOperation, IBasicToolOperationProps } from './basicToolOperation';
import DrawUtils from '../../utils/tool/DrawUtils';
import AxisUtils from '@/utils/tool/AxisUtils';
import uuid from '@/utils/uuid';
import { getBackCoordinate } from '@/utils/tool/CuboidUtils';

interface ICuboidOperationProps extends IBasicToolOperationProps {}

enum EDrawingStatus {
  Ready = 1,
  FirstPoint = 2,
  Rect = 3,
}

interface IDrawingCuboid extends IBasicAnnotationInfo {
  // Front Plane;
  frontPoints?: IPlanePoints;

  // Back Plane;
  backPoints?: IPlanePoints;
}

class CuboidOperation extends BasicToolOperation {
  public drawingCuboid?: IDrawingCuboid;

  // First Click
  public firstClickCoord?: ICoordinate;

  public drawingStatus = EDrawingStatus.Ready;

  public cuboidList: ICuboid[] = [];

  public constructor(props: ICuboidOperationProps) {
    super(props);
    this.config = CommonToolUtils.jsonParser(props.config);
  }

  public setResult() {}

  public onMouseUp(e: MouseEvent): boolean | void {
    super.onMouseUp(e);

    const basicSourceID = CommonToolUtils.getSourceID(this.basicResult);

    if (e.button === 0) {
      // 1. First Step
      if (!this.drawingCuboid) {
        this.createNewDrawingCuboid(e, basicSourceID);
        return;
      }

      // 2. Finish Rect
      if (this.drawingCuboid) {
        switch (this.drawingStatus) {
          case EDrawingStatus.FirstPoint:
            this.closeNewDrawingBoxFrontRect(e);
            break;
          case EDrawingStatus.Rect:
            this.closeBox3d(e);
            break;

          default: {
            //
          }
        }
      }
    }
  }

  public onMouseMove(e: MouseEvent): boolean | void {
    if (super.onMouseMove(e) || this.forbidMouseOperation || !this.imgInfo) {
      return;
    }
    if (this.drawingRectMove(e)) {
      return;
    }

    this.drawingCuboidMove(e);
  }

  public drawingRectMove(e: MouseEvent) {
    if (this.drawingCuboid && this.firstClickCoord && this.drawingStatus === EDrawingStatus.FirstPoint) {
      const coord = this.getCoordinateInOrigin(e);
      const { x, y } = this.firstClickCoord;
      const width = Math.abs(coord.x - x);
      const height = Math.abs(coord.y - y);

      this.drawingCuboid = {
        ...this.drawingCuboid,
        frontPoints: {
          tl: this.firstClickCoord,
          tr: {
            x: x + width,
            y,
          },
          bl: {
            x,
            y: y + height,
          },
          br: {
            x: x + width,
            y: y + height,
          },
        },
      };
      this.render();
      return true;
    }
  }

  public drawingCuboidMove(e: MouseEvent) {
    if (this.drawingCuboid && this.firstClickCoord && this.drawingStatus === EDrawingStatus.Rect) {
      const coord = this.getCoordinateInOrigin(e);

      if (coord.y > this.drawingCuboid.y + this.drawingCuboid.height) {
        return;
      }

      this.drawingCuboid = {
        ...this.drawingCuboid,
        sideLine: {
          bottom: {
            ...coord,
          },
          top: {
            x: coord.x,
            y: coord.y - this.drawingCuboid.height / 2,
          },
        },
      };
      this.render();
    }
  }

  public createNewDrawingCuboid(e: MouseEvent, basicSourceID: string) {
    if (!this.imgInfo) {
      return;
    }
    // const coordinateZoom = this.getCoordinateUnderZoom(e);
    // const coordinate = AxisUtils.changeDrawOutsideTarget(
    //   coordinateZoom,
    //   { x: 0, y: 0 },
    //   this.imgInfo,
    //   this.config.drawOutsideTarget,
    //   this.basicResult,
    //   this.zoom,
    // );
    const coordinate = this.getCoordinateInOrigin(e);

    // 1. step
    this.drawingCuboid = {
      attribute: this.defaultAttribute,
      valid: !e.ctrlKey,
      id: uuid(8, 62),
      sourceID: basicSourceID,
      textAttribute: '',
      frontPoints: {
        tl: coordinate,
        bl: coordinate,
        tr: coordinate,
        br: coordinate,
      },
    };

    this.firstClickCoord = {
      ...coordinate,
    };
    this.drawingStatus = EDrawingStatus.FirstPoint;
  }

  public closeNewDrawingBoxFrontRect(e: MouseEvent) {
    this.drawingStatus = EDrawingStatus.Rect;
  }

  public closeBox3d(e: MouseEvent) {
    this.cuboidList.push(this.drawingCuboid);
    this.drawingCuboid = undefined;
    this.drawingStatus = EDrawingStatus.Ready;
    this.render();
  }

  public renderBox(box3d: ICuboid) {
    const transformBox3d = AxisUtils.changeCuboidByZoom(box3d, this.zoom, this.currentPos);
    const toolColor = this.getColor(transformBox3d.attribute);
    const strokeColor = toolColor.valid.stroke;
    const lineWidth = this.style?.width ?? 2;
    const defaultStyle = {
      color: strokeColor,
      thickness: lineWidth,
    };
    if (transformBox3d.backPoints) {
      const backData = getBackCoordinate(transformBox3d);
      if (!backData) {
        return;
      }
      const { topRight, topLeft, bottomLeft, bottomRight, sideLine, frontPoints } = backData;

      const backRect = {
        x: topLeft.x,
        y: topLeft.y,
        width: topRight.x - topLeft.x,
        height: bottomRight.y - topRight.y,
      };
      sideLine?.forEach((line) => {
        DrawUtils.drawLine(this.canvas, line.p1, line.p2, { ...defaultStyle });
      });

      DrawUtils.drawRect(this.canvas, backRect, { ...defaultStyle });
      // DrawUtils.drawCircleWithFill(this.canvas, topLeft, 5, { ...defaultStyle });
      // DrawUtils.drawCircleWithFill(this.canvas, bottomLeft, 5, { ...defaultStyle });
      DrawUtils.drawCircleWithFill(this.canvas, topRight, 5, { ...defaultStyle });
      DrawUtils.drawCircleWithFill(this.canvas, bottomRight, 5, { ...defaultStyle });

      console.log('sideLine', sideLine);
    }
    const pointList = AxisUtils.transformPlain2PointList(transformBox3d.frontPoints);
    // DrawUtils.drawRectWithFill(this.canvas, transformBox3d, { color: toolColor.valid.fill });
    // DrawUtils.drawRect(this.canvas, transformBox3d, { ...defaultStyle });
    DrawUtils.drawPolygonWithFill(this.canvas, pointList, { color: toolColor.valid.fill });
  }

  public renderDrawing() {
    if (this.drawingCuboid) {
      this.renderBox(this.drawingCuboid);
    }
  }

  public renderStatic() {
    this.cuboidList.forEach((box3d) => this.renderBox(box3d));
  }

  public renderBox3d() {
    DrawUtils.drawRectWithFill(this.canvas, { x: 0, y: 0, width: 100, height: 100 }, { color: 'red' });
    this.renderStatic();
    this.renderDrawing();
  }

  public render() {
    if (!this.ctx) {
      return;
    }
    super.render();
    this.renderBox3d();
    this.renderCursorLine();
  }
}

export default CuboidOperation;
